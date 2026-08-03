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

// Entry describes one validated locally cached favicon.
type Entry struct {
	RuntimeID    string
	SourceURL    string
	ContentType  string
	ETag         string
	LastModified string
	FetchedAt    time.Time
	fileName     string
}

type metadata struct {
	RuntimeID    string    `json:"runtime_id"`
	SourceURL    string    `json:"source_url"`
	ContentType  string    `json:"content_type"`
	ETag         string    `json:"etag"`
	LastModified string    `json:"last_modified,omitempty"`
	FetchedAt    time.Time `json:"fetched_at"`
	FileName     string    `json:"file_name"`
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
	return entry, ok
}

// Open returns a locally cached icon file and its metadata.
func (s *Store) Open(runtimeID string) (Entry, *os.File, error) {
	entry, ok := s.Entry(runtimeID)
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
	return entry, file, nil
}

// Put atomically persists a validated icon and updates the in-memory index.
func (s *Store) Put(runtimeID, sourceURL, contentType, lastModified string, body []byte) (Entry, error) {
	if runtimeID == "" {
		return Entry{}, fmt.Errorf("favicon runtime ID must not be empty")
	}
	if len(body) == 0 {
		return Entry{}, fmt.Errorf("favicon body must not be empty")
	}
	digest := sha256.Sum256(append([]byte(sourceURL+"\x00"+runtimeID+"\x00"), body...))
	contentDigest := sha256.Sum256(body)
	fileName := hex.EncodeToString(digest[:]) + extensionFor(contentType)
	entry := Entry{
		RuntimeID: runtimeID, SourceURL: sourceURL, ContentType: contentType,
		ETag: "\"" + hex.EncodeToString(contentDigest[:]) + "\"", LastModified: lastModified,
		FetchedAt: time.Now().UTC(), fileName: fileName,
	}

	if err := writeAtomically(s.directory, fileName, body, 0o640); err != nil {
		return Entry{}, err
	}
	meta := metadata{
		RuntimeID: entry.RuntimeID, SourceURL: entry.SourceURL, ContentType: entry.ContentType,
		ETag: entry.ETag, LastModified: entry.LastModified, FetchedAt: entry.FetchedAt, FileName: entry.fileName,
	}
	encoded, err := json.Marshal(meta)
	if err != nil {
		return Entry{}, fmt.Errorf("encode favicon metadata: %w", err)
	}
	if err := writeAtomically(s.directory, metadataName(runtimeID), encoded, 0o640); err != nil {
		return Entry{}, err
	}
	s.mu.Lock()
	s.entries[runtimeID] = entry
	s.mu.Unlock()
	return entry, nil
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
		if _, err := os.Stat(filepath.Join(s.directory, meta.FileName)); err != nil {
			continue
		}
		s.entries[meta.RuntimeID] = Entry{
			RuntimeID: meta.RuntimeID, SourceURL: meta.SourceURL, ContentType: meta.ContentType,
			ETag: meta.ETag, LastModified: meta.LastModified, FetchedAt: meta.FetchedAt, fileName: meta.FileName,
		}
	}
	return nil
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

// ReadAll is used by tests and small API responses that need an in-memory icon copy.
func (s *Store) ReadAll(runtimeID string) (Entry, []byte, error) {
	entry, file, err := s.Open(runtimeID)
	if err != nil {
		return Entry{}, nil, err
	}
	defer file.Close()
	contents, err := io.ReadAll(file)
	if err != nil {
		return Entry{}, nil, fmt.Errorf("read favicon cache entry: %w", err)
	}
	return entry, contents, nil
}
