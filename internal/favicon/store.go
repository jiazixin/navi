// Package favicon discovers and serves validated, disposable site icon cache entries.
package favicon

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ErrNotFound indicates that no cached icon exists for a runtime ID.
var ErrNotFound = errors.New("favicon not found")

// Main configuration permits at most 4 MiB per icon. Recheck persisted blobs
// within that same bound when upgrading from an older cache validator.
const maxCachedIconBytes = 4 * 1024 * 1024

// Entry describes one validated locally cached favicon.
type Entry struct {
	RuntimeID    string
	SourceURL    string
	ContentType  string
	SourceETag   string
	ETag         string
	LastModified string
	FetchedAt    time.Time
	StaleSince   time.Time
	fileName     string
}

type metadata struct {
	RuntimeID    string    `json:"runtime_id"`
	SourceURL    string    `json:"source_url"`
	ContentType  string    `json:"content_type"`
	SourceETag   string    `json:"source_etag,omitempty"`
	ETag         string    `json:"etag"`
	LastModified string    `json:"last_modified,omitempty"`
	FetchedAt    time.Time `json:"fetched_at"`
	StaleSince   time.Time `json:"stale_since,omitzero"`
	FileName     string    `json:"file_name"`
}

func (e Entry) metadata() metadata {
	return metadata{
		RuntimeID: e.RuntimeID, SourceURL: e.SourceURL, ContentType: e.ContentType,
		SourceETag: e.SourceETag, ETag: e.ETag, LastModified: e.LastModified,
		FetchedAt: e.FetchedAt, StaleSince: e.StaleSince, FileName: e.fileName,
	}
}

func (m metadata) entry() Entry {
	return Entry{
		RuntimeID: m.RuntimeID, SourceURL: m.SourceURL, ContentType: m.ContentType,
		SourceETag: m.SourceETag, ETag: m.ETag, LastModified: m.LastModified,
		FetchedAt: m.FetchedAt, StaleSince: m.StaleSince, fileName: m.FileName,
	}
}

// Store owns the favicon directory and its small derived metadata index.
type Store struct {
	directory string
	mu        sync.RWMutex
	entries   map[string]Entry
}

// NewStore creates or opens a favicon cache below dataDir.
func NewStore(dataDir string) (*Store, error) {
	directory := filepath.Join(dataDir, "favicons")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return nil, fmt.Errorf("create favicon cache directory: %w", err)
	}
	store := &Store{directory: directory, entries: make(map[string]Entry)}
	if err := store.loadMetadata(); err != nil {
		return nil, err
	}
	return store, nil
}

// Entry returns cache metadata for a runtime ID.
func (s *Store) Entry(runtimeID string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.entries[runtimeID]
	if !ok {
		return Entry{}, false
	}
	// Cache files are disposable and may be removed outside this process. Never
	// let fresh metadata suppress a replacement download for a missing blob.
	info, err := os.Stat(filepath.Join(s.directory, entry.fileName))
	return entry, err == nil && info.Mode().IsRegular()
}

// Open returns a locally cached icon file and its metadata.
func (s *Store) Open(runtimeID string) (Entry, *os.File, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.entries[runtimeID]
	if !ok {
		return Entry{}, nil, ErrNotFound
	}
	file, err := os.Open(filepath.Join(s.directory, entry.fileName))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Entry{}, nil, ErrNotFound
		}
		return Entry{}, nil, fmt.Errorf("open favicon cache entry: %w", err)
	}
	if info, err := file.Stat(); err != nil || !info.Mode().IsRegular() {
		file.Close()
		return Entry{}, nil, ErrNotFound
	}
	return entry, file, nil
}

// Put atomically persists an icon and the validators returned by its remote
// source. ETag is derived locally from the validated bytes and is kept separate
// from SourceETag, which is only used for conditional refreshes.
func (s *Store) Put(runtimeID, sourceURL, contentType, sourceETag, lastModified string, body []byte) (Entry, error) {
	if runtimeID == "" {
		return Entry{}, fmt.Errorf("favicon runtime ID must not be empty")
	}
	if len(body) == 0 {
		return Entry{}, fmt.Errorf("favicon body must not be empty")
	}
	digest := sha256.Sum256(append([]byte(sourceURL+"\x00"+runtimeID+"\x00"), body...))
	contentDigest := sha256.Sum256(body)
	fileName := hex.EncodeToString(digest[:]) + extensionFor(contentType)
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, hadPrevious := s.entries[runtimeID]
	entry := Entry{
		RuntimeID: runtimeID, SourceURL: sourceURL, ContentType: contentType,
		SourceETag: sourceETag, ETag: "\"" + hex.EncodeToString(contentDigest[:]) + "\"", LastModified: lastModified,
		FetchedAt: time.Now().UTC(), fileName: fileName,
	}

	if err := writeAtomically(s.directory, fileName, body, 0o640); err != nil {
		return Entry{}, err
	}
	if err := s.writeMetadataLocked(entry); err != nil {
		return Entry{}, err
	}
	s.entries[runtimeID] = entry
	if hadPrevious && previous.fileName != "" && previous.fileName != fileName {
		// The new entry is already published. A failed removal leaves only a
		// harmless orphaned blob, so the error does not fail the update.
		_ = os.Remove(filepath.Join(s.directory, previous.fileName))
	}
	return entry, nil
}

// Refresh records a successful conditional refresh (HTTP 304) without
// rewriting the cached bytes. It returns the updated cache entry.
func (s *Store) Refresh(runtimeID, sourceURL, sourceETag, lastModified string) (Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[runtimeID]
	if !ok || entry.SourceURL != sourceURL {
		return Entry{}, ErrNotFound
	}
	if info, err := os.Stat(filepath.Join(s.directory, entry.fileName)); err != nil || !info.Mode().IsRegular() {
		return Entry{}, ErrNotFound
	}
	if sourceETag != "" {
		entry.SourceETag = sourceETag
	}
	if lastModified != "" {
		entry.LastModified = lastModified
	}
	entry.FetchedAt = time.Now().UTC()
	entry.StaleSince = time.Time{}
	if err := s.writeMetadataLocked(entry); err != nil {
		return Entry{}, err
	}
	s.entries[runtimeID] = entry
	return entry, nil
}

// Cleanup marks entries absent from activeRuntimeIDs as cleanup candidates and
// removes candidates only after grace has elapsed. This keeps a removed link's
// derived cache around briefly in case a catalog edit is reverted.
func (s *Store) Cleanup(activeRuntimeIDs map[string]struct{}, grace time.Duration) (int, error) {
	if grace < 0 {
		return 0, fmt.Errorf("favicon cleanup grace must not be negative")
	}
	now := time.Now().UTC()
	removed := 0
	s.mu.Lock()
	defer s.mu.Unlock()
	for runtimeID, entry := range s.entries {
		if _, active := activeRuntimeIDs[runtimeID]; active {
			if entry.StaleSince.IsZero() {
				continue
			}
			entry.StaleSince = time.Time{}
			if err := s.writeMetadataLocked(entry); err != nil {
				return removed, err
			}
			s.entries[runtimeID] = entry
			continue
		}
		if entry.StaleSince.IsZero() {
			entry.StaleSince = now
			if err := s.writeMetadataLocked(entry); err != nil {
				return removed, err
			}
			s.entries[runtimeID] = entry
			continue
		}
		if now.Sub(entry.StaleSince) < grace {
			continue
		}
		if err := os.Remove(filepath.Join(s.directory, entry.fileName)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return removed, fmt.Errorf("remove stale favicon cache file: %w", err)
		}
		if err := os.Remove(filepath.Join(s.directory, metadataName(runtimeID))); err != nil && !errors.Is(err, os.ErrNotExist) {
			return removed, fmt.Errorf("remove stale favicon metadata: %w", err)
		}
		delete(s.entries, runtimeID)
		removed++
	}
	return removed, nil
}

func (s *Store) loadMetadata() error {
	paths, err := filepath.Glob(filepath.Join(s.directory, "*.meta.json"))
	if err != nil {
		return fmt.Errorf("list favicon metadata: %w", err)
	}
	for _, path := range paths {
		contents, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var meta metadata
		if err := json.Unmarshal(contents, &meta); err != nil || !validMetadata(meta) {
			continue
		}
		if info, err := os.Stat(filepath.Join(s.directory, meta.FileName)); err != nil || !info.Mode().IsRegular() {
			continue
		}
		icon, err := os.Open(filepath.Join(s.directory, meta.FileName))
		if err != nil {
			continue
		}
		contents, readErr := io.ReadAll(io.LimitReader(icon, maxCachedIconBytes+1))
		closeErr := icon.Close()
		if readErr != nil || closeErr != nil || len(contents) > maxCachedIconBytes {
			continue
		}
		if actualType, ok := validatedContentType(meta.ContentType, contents); !ok || actualType != meta.ContentType {
			continue
		}
		s.entries[meta.RuntimeID] = meta.entry()
	}
	return nil
}

func (s *Store) writeMetadataLocked(entry Entry) error {
	encoded, err := json.Marshal(entry.metadata())
	if err != nil {
		return fmt.Errorf("encode favicon metadata: %w", err)
	}
	return writeAtomically(s.directory, metadataName(entry.RuntimeID), encoded, 0o640)
}

func validMetadata(meta metadata) bool {
	if meta.RuntimeID == "" || meta.SourceURL == "" || meta.ContentType == "" || meta.FileName == "" || meta.ETag == "" {
		return false
	}
	if filepath.Base(meta.FileName) != meta.FileName || strings.Contains(meta.FileName, string(filepath.Separator)) {
		return false
	}
	return true
}

func writeAtomically(directory, name string, body []byte, permissions os.FileMode) error {
	temporary, err := os.CreateTemp(directory, ".navi-*")
	if err != nil {
		return fmt.Errorf("create favicon temporary file: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(permissions); err != nil {
		temporary.Close()
		return fmt.Errorf("set favicon temporary file permissions: %w", err)
	}
	if _, err := temporary.Write(body); err != nil {
		temporary.Close()
		return fmt.Errorf("write favicon temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close favicon temporary file: %w", err)
	}
	if err := os.Rename(temporaryName, filepath.Join(directory, name)); err != nil {
		return fmt.Errorf("publish favicon cache file: %w", err)
	}
	return nil
}

func metadataName(runtimeID string) string {
	digest := sha256.Sum256([]byte(runtimeID))
	return hex.EncodeToString(digest[:]) + ".meta.json"
}

func extensionFor(contentType string) string {
	switch contentType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ".ico"
	}
}
