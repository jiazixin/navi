package catalog

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWatcherReloadsWritesAndAtomicRenames(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, catalogWithTitle("First"))
	store := NewStore()
	initial, err := LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(initial)
	watcher := NewWatcher(path, 20*time.Millisecond, LoadFile, store)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(watcher.Stop)

	subscription := watcher.Subscribe()
	t.Cleanup(subscription.Close)
	writeWatchedCatalog(t, path, "Second", false)
	waitForEvent(t, subscription.Events(), EventCatalogUpdated)
	if got := mustSnapshot(t, store).Catalog().Pages[0].Title; got != "Second" {
		t.Fatalf("title after write = %q, want Second", got)
	}

	writeWatchedCatalog(t, path, "Third", true)
	waitForEvent(t, subscription.Events(), EventCatalogUpdated)
	if got := mustSnapshot(t, store).Catalog().Pages[0].Title; got != "Third" {
		t.Fatalf("title after rename = %q, want Third", got)
	}
}

func TestWatcherKeepsLastValidSnapshotWhenReloadFails(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, catalogWithTitle("First"))
	store := NewStore()
	initial, err := LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(initial)
	watcher := NewWatcher(path, 20*time.Millisecond, LoadFile, store)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(watcher.Stop)

	subscription := watcher.Subscribe()
	t.Cleanup(subscription.Close)
	if err := os.WriteFile(path, []byte("version: [\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	waitForEvent(t, subscription.Events(), EventCatalogError)
	if got := mustSnapshot(t, store).Catalog().Pages[0].Title; got != "First" {
		t.Fatalf("title after invalid reload = %q, want First", got)
	}
	if degraded, _ := watcher.Degraded(); !degraded {
		t.Fatal("watcher should be degraded after invalid reload")
	}

	writeWatchedCatalog(t, path, "Recovered", false)
	waitForEvent(t, subscription.Events(), EventCatalogUpdated)
	if degraded, _ := watcher.Degraded(); degraded {
		t.Fatal("watcher should recover after valid reload")
	}
}

func TestWatcherDebouncesRapidChanges(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, catalogWithTitle("First"))
	store := NewStore()
	initial, err := LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(initial)
	loads := make(chan struct{}, 10)
	loader := func(path string) (Catalog, error) {
		loads <- struct{}{}
		return LoadFile(path)
	}
	watcher := NewWatcher(path, 80*time.Millisecond, loader, store)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(watcher.Stop)

	for _, title := range []string{"Second", "Third", "Final"} {
		writeWatchedCatalog(t, path, title, false)
	}
	deadline := time.After(2 * time.Second)
	select {
	case <-loads:
	case <-deadline:
		t.Fatal("watcher did not reload")
	}
	select {
	case <-loads:
		t.Fatal("watcher reloaded more than once for a burst")
	case <-time.After(200 * time.Millisecond):
	}
	if got := mustSnapshot(t, store).Catalog().Pages[0].Title; got != "Final" {
		t.Fatalf("title after debounced reload = %q, want Final", got)
	}
}

func TestSubscriptionDropsStaleEventsForSlowConsumers(t *testing.T) {
	t.Parallel()

	hub := newEventHub()
	subscription := hub.Subscribe()
	defer subscription.Close()
	hub.Publish(Event{Type: EventCatalogUpdated, Revision: 1})
	hub.Publish(Event{Type: EventCatalogUpdated, Revision: 2})

	select {
	case event := <-subscription.Events():
		if event.Revision != 2 {
			t.Fatalf("revision = %d, want newest event", event.Revision)
		}
	case <-time.After(time.Second):
		t.Fatal("subscription did not receive an event")
	}
}

func TestWatcherStopBeforeStartIsSafeAndPreventsReuse(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, catalogWithTitle("Initial"))
	watcher := NewWatcher(path, time.Millisecond, LoadFile, NewStore())
	stopped := make(chan struct{})
	go func() {
		watcher.Stop()
		close(stopped)
	}()
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("Stop() blocked before Start()")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := watcher.Start(ctx); err == nil {
		t.Fatal("Start() after Stop() should fail")
	}
	watcher.Stop()
}

func TestWatcherStartRejectsSecondStart(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, catalogWithTitle("Initial"))
	watcher := NewWatcher(path, time.Millisecond, LoadFile, NewStore())
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Stop()
	if err := watcher.Start(ctx); err == nil {
		t.Fatal("second Start() should fail")
	}
}

func writeWatchedCatalog(t *testing.T, path, title string, atomicRename bool) {
	t.Helper()
	contents := []byte(catalogWithTitle(title))
	if !atomicRename {
		if err := os.WriteFile(path, contents, 0o600); err != nil {
			t.Fatal(err)
		}
		return
	}
	temporary := filepath.Join(filepath.Dir(path), ".urls.yaml.tmp")
	if err := os.WriteFile(temporary, contents, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(temporary, path); err != nil {
		t.Fatal(err)
	}
}

func catalogWithTitle(title string) string {
	return "version: 1\npages:\n  - id: page1\n    title: " + title + "\n    urls: []\n"
}

func waitForEvent(t *testing.T, events <-chan Event, want EventType) Event {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				t.Fatal("event subscription closed")
			}
			if event.Type == want {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q", want)
		}
	}
}

func mustSnapshot(t *testing.T, store *Store) *Snapshot {
	t.Helper()
	snapshot, ok := store.Snapshot()
	if !ok {
		t.Fatal("store has no snapshot")
	}
	return snapshot
}
