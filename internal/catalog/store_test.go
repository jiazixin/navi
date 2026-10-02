package catalog

import (
	"sync"
	"testing"
)

func TestStorePublishesMonotonicRevisionsAndETags(t *testing.T) {
	t.Parallel()

	store := NewStore()
	first := store.Publish(testCatalog("One"))
	second := store.Publish(testCatalog("Two"))

	if first.Revision() != 1 || second.Revision() != 2 {
		t.Fatalf("revisions = %d, %d", first.Revision(), second.Revision())
	}
	if first.ETag() == second.ETag() {
		t.Fatalf("ETags should differ: %q", first.ETag())
	}
	current, ok := store.Snapshot()
	if !ok || current.Revision() != 2 || current.Catalog().Pages[0].Title != "Two" {
		t.Fatalf("Snapshot() = %#v, %t", current, ok)
	}
}

func TestStoreKeepsOldSnapshotsWholeAfterReplacement(t *testing.T) {
	t.Parallel()

	store := NewStore()
	first := store.Publish(testCatalog("One"))
	store.Publish(testCatalog("Two"))

	if got := first.Catalog().Pages[0].Title; got != "One" {
		t.Fatalf("old snapshot title = %q, want One", got)
	}
	copy := first.Catalog()
	copy.Pages[0].Groups[0].Links[0].Tags[0] = "changed"
	if got := first.Catalog().Pages[0].Groups[0].Links[0].Tags[0]; got != "tag" {
		t.Fatalf("snapshot mutated through returned catalog: %q", got)
	}
}

func TestStoreSupportsConcurrentReadersAndWriters(t *testing.T) {
	store := NewStore()
	store.Publish(testCatalog("initial"))

	const readers = 20
	const writes = 100
	var readersDone sync.WaitGroup
	for range readers {
		readersDone.Go(func() {
			for range writes {
				snapshot, ok := store.Snapshot()
				if !ok {
					t.Error("Snapshot() returned no value")
					return
				}
				_ = snapshot.Catalog().Pages
			}
		})
	}
	for range writes {
		store.Publish(testCatalog("updated"))
	}
	readersDone.Wait()
}

func testCatalog(title string) Catalog {
	return Catalog{
		Pages: []Page{{
			ID: "page1", Title: title,
			Groups: []Group{{
				Name:  "One",
				Links: []Link{{RuntimeID: "one", Name: "One", Tags: []string{"tag"}}},
			}},
		}},
	}
}
