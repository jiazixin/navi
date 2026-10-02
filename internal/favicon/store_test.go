package favicon

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"testing"
)

func TestStorePersistsAndReloadsValidatedEntries(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.Put("example", "https://example.test/favicon.png", "image/png", "", []byte("\x89PNG\r\n\x1a\nimage"))
	if err != nil {
		t.Fatal(err)
	}
	entry, contents, err := store.ReadAll("example")
	if err != nil {
		t.Fatal(err)
	}
	if entry.ETag != created.ETag || string(contents) != "\x89PNG\r\n\x1a\nimage" {
		t.Fatalf("entry = %#v, contents = %q", entry, contents)
	}

	reopened, err := NewStore(store.directory[:len(store.directory)-len("favicons")])
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := reopened.ReadAll("example"); err != nil {
		t.Fatalf("reopened store did not load entry: %v", err)
	}
	_, _, err = reopened.ReadAll("missing")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("ReadAll(missing) error = %v", err)
	}
}

func TestStoreSerializesConcurrentReplacementAndReads(t *testing.T) {
	directory := t.TempDir()
	store, err := NewStore(directory)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put("one", "https://example.test/icon", "image/png", "", []byte("initial")); err != nil {
		t.Fatal(err)
	}
	var work sync.WaitGroup
	for worker := range 8 {
		work.Go(func() {
			for iteration := range 20 {
				body := []byte(fmt.Sprintf("image-%d-%d", worker, iteration))
				if _, err := store.Put("one", "https://example.test/icon", "image/png", "", body); err != nil {
					t.Error(err)
					return
				}
				entry, body, err := store.ReadAll("one")
				if err != nil {
					t.Error(err)
					return
				}
				digest := sha256.Sum256(body)
				if entry.ETag != `"`+hex.EncodeToString(digest[:])+`"` {
					t.Error("metadata and served image disagree")
				}
			}
		})
	}
	work.Wait()
	reopened, err := NewStore(directory)
	if err != nil {
		t.Fatal(err)
	}
	current, _ := store.Entry("one")
	persisted, body, err := reopened.ReadAll("one")
	if err != nil || persisted.ETag != current.ETag {
		t.Fatalf("persisted entry disagrees with current entry: %v", err)
	}
	digest := sha256.Sum256(body)
	if persisted.ETag != `"`+hex.EncodeToString(digest[:])+`"` {
		t.Fatal("persisted metadata and image disagree")
	}
}
