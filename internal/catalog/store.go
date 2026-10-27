package catalog

import (
	"fmt"
	"sync"
	"sync/atomic"
)

// Store publishes complete catalog snapshots without blocking readers.
// mu serializes revision allocation; current atomically publishes immutable snapshots.
type Store struct {
	mu           sync.Mutex
	nextRevision uint64
	current      atomic.Pointer[Snapshot]
}

// Snapshot is an immutable catalog view associated with a revision and ETag.
type Snapshot struct {
	revision uint64
	etag     string
	catalog  Catalog
}

// NewStore creates a catalog snapshot store.
func NewStore() *Store {
	return &Store{}
}

// Publish atomically makes a complete catalog visible to readers.
func (s *Store) Publish(catalog Catalog) *Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextRevision++
	snapshot := &Snapshot{
		revision: s.nextRevision,
		etag:     fmt.Sprintf("\"catalog-%d\"", s.nextRevision),
		catalog:  catalog.clone(),
	}
	s.current.Store(snapshot)
	return snapshot
}

// Snapshot returns the current catalog snapshot when one has been published.
func (s *Store) Snapshot() (*Snapshot, bool) {
	snapshot := s.current.Load()
	return snapshot, snapshot != nil
}

// Revision returns the snapshot revision.
func (s *Snapshot) Revision() uint64 {
	return s.revision
}

// ETag returns the HTTP ETag associated with the snapshot revision.
func (s *Snapshot) ETag() string {
	return s.etag
}

// Catalog returns a defensive copy of the immutable snapshot catalog.
func (s *Snapshot) Catalog() Catalog {
	return s.catalog.clone()
}

// FindLink returns one defensive link copy without cloning the entire catalog.
func (s *Snapshot) FindLink(runtimeID string) (Link, bool) {
	return s.catalog.FindLink(runtimeID)
}
