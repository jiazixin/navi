package favicon

import (
	"errors"
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
