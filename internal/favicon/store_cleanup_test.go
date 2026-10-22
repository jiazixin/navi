package favicon

import (
	"errors"
	"testing"
	"time"
)

func TestStoreCleanupKeepsCandidatesForGracePeriod(t *testing.T) {
	t.Parallel()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put("removed", "https://example.test/favicon.png", "image/png", "", "", []byte("icon")); err != nil {
		t.Fatal(err)
	}
	if removed, err := store.Cleanup(map[string]struct{}{}, 24*time.Hour); err != nil || removed != 0 {
		t.Fatalf("first cleanup = removed %d, err %v", removed, err)
	}
	entry, ok := store.Entry("removed")
	if !ok || entry.StaleSince.IsZero() {
		t.Fatalf("entry was not marked as stale candidate: %#v, ok=%v", entry, ok)
	}
	store.mu.Lock()
	entry.StaleSince = time.Now().Add(-48 * time.Hour)
	store.entries[entry.RuntimeID] = entry
	store.mu.Unlock()
	if removed, err := store.Cleanup(map[string]struct{}{}, 24*time.Hour); err != nil || removed != 1 {
		t.Fatalf("expired cleanup = removed %d, err %v", removed, err)
	}
	if _, _, err := readCachedIcon(store, "removed"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("removed cache error = %v", err)
	}
}

func TestStoreCleanupClearsCandidateWhenLinkReturns(t *testing.T) {
	t.Parallel()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put("restored", "https://example.test/favicon.png", "image/png", "", "", []byte("icon")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Cleanup(map[string]struct{}{}, time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Cleanup(map[string]struct{}{"restored": {}}, time.Hour); err != nil {
		t.Fatal(err)
	}
	entry, ok := store.Entry("restored")
	if !ok || !entry.StaleSince.IsZero() {
		t.Fatalf("restored entry stale marker = %#v, ok=%v", entry, ok)
	}
}
