// Package favicon discovers and serves validated, disposable site icon cache entries.
// Construct a Manager, call Start once, and call Shutdown with a deadline before exit.
package favicon

import (
	"context"
	"crypto/rand"
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

	"navi/internal/timefmt"
)

// ErrNotFound indicates that no cached icon exists for a runtime ID.
var ErrNotFound = errors.New("favicon not found")

// Main configuration permits at most 4 MiB per icon. Recheck persisted blobs
// within that same bound when upgrading from an older cache validator.
const maxCachedIconBytes = 4 * 1024 * 1024
const maxMetadataBytes = 32 * 1024
const maxCacheEntries = 4096
const maxCacheFiles = maxCacheEntries * 4

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
	RuntimeID    string       `json:"runtime_id"`
	SourceURL    string       `json:"source_url"`
	ContentType  string       `json:"content_type"`
	SourceETag   string       `json:"source_etag,omitzero"`
	ETag         string       `json:"etag"`
	LastModified string       `json:"last_modified,omitzero"`
	FetchedAt    timefmt.Time `json:"fetched_at"`
	StaleSince   timefmt.Time `json:"stale_since,omitzero"`
	FileName     string       `json:"file_name"`
}

func (e Entry) metadata() metadata {
	return metadata{
		RuntimeID: e.RuntimeID, SourceURL: e.SourceURL, ContentType: e.ContentType,
		SourceETag: e.SourceETag, ETag: e.ETag, LastModified: e.LastModified,
		FetchedAt: timefmt.Time(e.FetchedAt), StaleSince: timefmt.Time(e.StaleSince), FileName: e.fileName,
	}
}

func (m metadata) entry() Entry {
	return Entry{
		RuntimeID: m.RuntimeID, SourceURL: m.SourceURL, ContentType: m.ContentType,
		SourceETag: m.SourceETag, ETag: m.ETag, LastModified: m.LastModified,
		FetchedAt: time.Time(m.FetchedAt), StaleSince: time.Time(m.StaleSince), fileName: m.FileName,
	}
}

// Store owns the favicon directory and its bounded derived metadata index.
// mu guards entries; now is configured before concurrent use.
type Store struct {
	directory string
	mu        sync.RWMutex
	entries   map[string]Entry
	now       func() time.Time
}

// NewStore creates or opens a favicon cache below dataDir.
func NewStore(ctx context.Context, dataDir string) (*Store, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	directory := filepath.Join(dataDir, "favicons")
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, fmt.Errorf("create favicon cache directory: %w", err)
	}
	parent, err := os.OpenRoot(dataDir)
	if err != nil {
		return nil, fmt.Errorf("open favicon storage root: %w", err)
	}
	defer parent.Close() // No buffered writes on a directory handle.
	if err := parent.Mkdir("favicons", 0o750); err != nil && !errors.Is(err, os.ErrExist) {
		return nil, fmt.Errorf("create favicon directory: %w", err)
	}
	store := &Store{directory: directory, entries: make(map[string]Entry), now: time.Now}
	if err := store.loadMetadata(ctx); err != nil {
		return nil, err
	}
	return store, nil
}

// Entry returns cache metadata for a runtime ID.
func (s *Store) Entry(ctx context.Context, runtimeID string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.entries[runtimeID]
	if !ok {
		return Entry{}, false
	}
	// Cache files are disposable and may be removed outside this process. Never
	// let fresh metadata suppress a replacement download for a missing blob.
	info, err := s.statEntry(ctx, entry.fileName)
	return entry, err == nil && info.Mode().IsRegular() && info.Size() <= maxCachedIconBytes
}

// Open returns a locally cached icon file and its metadata.
func (s *Store) Open(ctx context.Context, runtimeID string) (Entry, *os.File, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.entries[runtimeID]
	if !ok {
		return Entry{}, nil, ErrNotFound
	}
	root, err := s.cacheRoot(ctx)
	if err != nil {
		return Entry{}, nil, fmt.Errorf("open favicon cache root: %w", err)
	}
	defer root.Close() // The returned file owns its descriptor independently.
	file, err := root.Open(entry.fileName)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Entry{}, nil, ErrNotFound
		}
		return Entry{}, nil, fmt.Errorf("open favicon cache entry: %w", err)
	}
	if info, err := file.Stat(); err != nil || !info.Mode().IsRegular() || info.Size() > maxCachedIconBytes {
		_ = file.Close() // Read-only descriptor; the invalid entry is already rejected.
		return Entry{}, nil, ErrNotFound
	}
	return entry, file, nil
}

// WriteRequest groups the inputs for Put.
type WriteRequest struct {
	RuntimeID    string
	SourceURL    string
	ContentType  string
	SourceETag   string
	LastModified string
	Body         []byte
}

// Put atomically persists an icon and the validators returned by its remote
// source. ETag is derived locally from the validated bytes and is kept separate
// from SourceETag, which is only used for conditional refreshes.
func (s *Store) Put(ctx context.Context, options WriteRequest) (Entry, error) {
	runtimeID, sourceURL, contentType, sourceETag, lastModified, body := options.RuntimeID, options.SourceURL, options.ContentType, options.SourceETag, options.LastModified, options.Body

	if runtimeID == "" {
		return Entry{}, errors.New("favicon runtime ID must not be empty")
	}
	if len(runtimeID) > 256 || len(sourceURL) > 4096 || len(sourceETag) > 4096 || len(lastModified) > 256 {
		return Entry{}, errors.New("favicon metadata exceeds field limits")
	}
	if len(body) == 0 || len(body) > maxCachedIconBytes {
		return Entry{}, errors.New("favicon body must contain 1 byte to 4 MiB")
	}
	digest := sha256.Sum256(append([]byte(sourceURL+"\x00"+runtimeID+"\x00"), body...))
	contentDigest := sha256.Sum256(body)
	fileName := hex.EncodeToString(digest[:]) + extensionFor(contentType)
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, hadPrevious := s.entries[runtimeID]
	if !hadPrevious && len(s.entries) >= maxCacheEntries {
		return Entry{}, errors.New("favicon cache capacity reached")
	}
	entry := Entry{
		RuntimeID: runtimeID, SourceURL: sourceURL, ContentType: contentType,
		SourceETag: sourceETag, ETag: "\"" + hex.EncodeToString(contentDigest[:]) + "\"", LastModified: lastModified,
		FetchedAt: s.now().UTC().Truncate(time.Millisecond), fileName: fileName,
	}

	if err := s.writeAtomically(ctx, fileName, body); err != nil {
		return Entry{}, err
	}
	if err := s.writeMetadataLocked(ctx, entry); err != nil {
		return Entry{}, err
	}
	s.entries[runtimeID] = entry
	if hadPrevious && previous.fileName != "" && previous.fileName != fileName {
		// The new entry is already published. A failed removal leaves only a
		// harmless orphaned blob, so the error does not fail the update.
		_ = s.removeEntry(ctx, previous.fileName)
	}
	return entry, nil
}

// RefreshRequest groups the inputs for Refresh.
type RefreshRequest struct {
	RuntimeID    string
	SourceURL    string
	SourceETag   string
	LastModified string
}

// Refresh records a successful conditional refresh (HTTP 304) without
// rewriting the cached bytes. It returns the updated cache entry.
func (s *Store) Refresh(ctx context.Context, options RefreshRequest) (Entry, error) {
	runtimeID, sourceURL, sourceETag, lastModified := options.RuntimeID, options.SourceURL, options.SourceETag, options.LastModified

	if len(sourceETag) > 4096 || len(lastModified) > 256 {
		return Entry{}, errors.New("favicon validators exceed field limits")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[runtimeID]
	if !ok || entry.SourceURL != sourceURL {
		return Entry{}, ErrNotFound
	}
	if info, err := s.statEntry(ctx, entry.fileName); err != nil || !info.Mode().IsRegular() || info.Size() > maxCachedIconBytes {
		return Entry{}, ErrNotFound
	}
	if sourceETag != "" {
		entry.SourceETag = sourceETag
	}
	if lastModified != "" {
		entry.LastModified = lastModified
	}
	entry.FetchedAt = s.now().UTC().Truncate(time.Millisecond)
	entry.StaleSince = time.Time{}
	if err := s.writeMetadataLocked(ctx, entry); err != nil {
		return Entry{}, err
	}
	s.entries[runtimeID] = entry
	return entry, nil
}

// Cleanup marks entries absent from activeRuntimeIDs as cleanup candidates and
// removes candidates only after grace has elapsed. This keeps a removed link's
// derived cache around briefly in case a catalog edit is reverted.
func (s *Store) Cleanup(ctx context.Context, activeRuntimeIDs map[string]struct{}, grace time.Duration) (int, error) {
	if grace < 0 {
		return 0, errors.New("favicon cleanup grace must not be negative")
	}
	now := s.now().UTC().Truncate(time.Millisecond)
	removed := 0
	s.mu.Lock()
	defer s.mu.Unlock()
	for runtimeID, entry := range s.entries {
		if _, active := activeRuntimeIDs[runtimeID]; active {
			if entry.StaleSince.IsZero() {
				continue
			}
			entry.StaleSince = time.Time{}
			if err := s.writeMetadataLocked(ctx, entry); err != nil {
				return removed, err
			}
			s.entries[runtimeID] = entry
			continue
		}
		if entry.StaleSince.IsZero() {
			entry.StaleSince = now
			if err := s.writeMetadataLocked(ctx, entry); err != nil {
				return removed, err
			}
			s.entries[runtimeID] = entry
			continue
		}
		if now.Sub(entry.StaleSince) < grace {
			continue
		}
		if err := s.removeEntry(ctx, entry.fileName); err != nil && !errors.Is(err, os.ErrNotExist) {
			return removed, fmt.Errorf("remove stale favicon cache file: %w", err)
		}
		if err := s.removeEntry(ctx, metadataName(runtimeID)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return removed, fmt.Errorf("remove stale favicon metadata: %w", err)
		}
		delete(s.entries, runtimeID)
		removed++
	}
	return removed, nil
}

// cacheRoot keeps both the cache directory and its children inside dataDir.
func (s *Store) cacheRoot(ctx context.Context) (*os.Root, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	parent, err := os.OpenRoot(filepath.Dir(s.directory))
	if err != nil {
		return nil, err
	}
	defer parent.Close() // The child root owns an independent descriptor.
	return parent.OpenRoot(filepath.Base(s.directory))
}

func (s *Store) statEntry(ctx context.Context, name string) (os.FileInfo, error) {
	root, err := s.cacheRoot(ctx)
	if err != nil {
		return nil, fmt.Errorf("open favicon cache root: %w", err)
	}
	defer root.Close() // Read-only descriptor cleanup cannot change the result.
	return root.Stat(name)
}

func (s *Store) removeEntry(ctx context.Context, name string) error {
	root, err := s.cacheRoot(ctx)
	if err != nil {
		return fmt.Errorf("open favicon cache root: %w", err)
	}
	defer root.Close() // No writable file remains on this descriptor.
	return root.Remove(name)
}

func readCacheFile(ctx context.Context, root *os.Root, name string, limit int64) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	info, err := root.Stat(name)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, errors.New("invalid cached file type or size")
	}
	file, err := root.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close() // Reads have no buffered writes to flush.
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("cached file exceeds size limit")
	}
	return data, nil
}

func (s *Store) loadMetadata(ctx context.Context) error {
	root, err := s.cacheRoot(ctx)
	if err != nil {
		return fmt.Errorf("open favicon cache root: %w", err)
	}
	defer root.Close() // Read-only descriptor cleanup.
	directory, err := root.Open(".")
	if err != nil {
		return fmt.Errorf("open favicon directory listing: %w", err)
	}
	defer directory.Close() // Read-only directory descriptor.
	// Corrupt, oversized or missing derived cache entries are deliberately skipped;
	// the manager downloads them again. Bound both listing and retained metadata.
	for scanned := 0; scanned < maxCacheFiles && len(s.entries) < maxCacheEntries; {
		entries, err := directory.ReadDir(64)
		if err != nil && !errors.Is(err, io.EOF) {
			return fmt.Errorf("read favicon directory: %w", err)
		}
		for _, entry := range entries {
			if err := ctx.Err(); err != nil {
				return err
			}
			scanned++
			if !strings.HasSuffix(entry.Name(), ".meta.json") {
				continue
			}
			data, err := readCacheFile(ctx, root, entry.Name(), maxMetadataBytes)
			if err != nil {
				continue
			}
			var meta metadata
			if err := json.Unmarshal(data, &meta); err != nil || !validMetadata(meta) {
				continue
			}
			icon, err := readCacheFile(ctx, root, meta.FileName, maxCachedIconBytes)
			if err != nil {
				continue
			}
			if contentType, ok := validatedContentType(meta.ContentType, icon); !ok || contentType != meta.ContentType {
				continue
			}
			if len(s.entries) >= maxCacheEntries {
				break
			}
			s.entries[meta.RuntimeID] = meta.entry()
		}
		if errors.Is(err, io.EOF) {
			break
		}
	}
	return nil
}

func (s *Store) writeMetadataLocked(ctx context.Context, entry Entry) error {
	encoded, err := json.Marshal(entry.metadata())
	if err != nil {
		return fmt.Errorf("encode favicon metadata: %w", err)
	}
	if len(encoded) > maxMetadataBytes {
		return errors.New("favicon metadata exceeds size limit")
	}
	return s.writeAtomically(ctx, metadataName(entry.RuntimeID), encoded)
}

func validMetadata(meta metadata) bool {
	if meta.RuntimeID == "" || meta.SourceURL == "" || meta.ContentType == "" || meta.FileName == "" || meta.ETag == "" {
		return false
	}
	if !filepath.IsLocal(meta.FileName) || filepath.Base(meta.FileName) != meta.FileName {
		return false
	}
	return true
}

func (s *Store) writeAtomically(ctx context.Context, name string, body []byte) error {
	root, err := s.cacheRoot(ctx)
	if err != nil {
		return fmt.Errorf("open favicon cache root: %w", err)
	}
	defer root.Close() // The file is explicitly closed before publication.
	temporaryName := ".navi-" + rand.Text()
	temporary, err := root.OpenFile(temporaryName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return fmt.Errorf("create favicon temporary file: %w", err)
	}
	defer func() { _ = root.Remove(temporaryName) }() // Best-effort orphan cleanup after rename or failure.
	if _, err := temporary.Write(body); err != nil {
		return fmt.Errorf("write favicon temporary file: %w", errors.Join(err, temporary.Close()))
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close favicon temporary file: %w", err)
	}
	if err := root.Rename(temporaryName, name); err != nil {
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
