package favicon

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreRefusesEscapingSymlink(t *testing.T) {
	t.Parallel()
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "secret.svg")
	if err := os.WriteFile(outside, []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(store.directory, "escape.svg")); err != nil {
		t.Fatal(err)
	}
	store.entries["escape"] = Entry{RuntimeID: "escape", fileName: "escape.svg"}
	if _, file, err := store.Open(t.Context(), "escape"); err == nil {
		file.Close()
		t.Fatal("opened icon outside cache root")
	}
	if _, ok := store.Entry(t.Context(), "escape"); ok {
		t.Fatal("escaping icon is available")
	}
}

func TestStoreBoundsPersistedMetadataAndWrites(t *testing.T) {
	t.Parallel()
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put(t.Context(), WriteRequest{RuntimeID: "large", SourceURL: "https://example.test/icon", ContentType: "image/png", Body: make([]byte, maxCachedIconBytes+1)}); err == nil {
		t.Fatal("accepted oversized icon")
	}
	path := filepath.Join(store.directory, "oversized.meta.json")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(64 << 20); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := NewStore(t.Context(), filepath.Dir(store.directory))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := reopened.Open(t.Context(), "large"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v, want not found", err)
	}
}

func TestStoreRejectsEscapingDirectoryAndCanceledContext(t *testing.T) {
	storage, outside := t.TempDir(), t.TempDir()
	if err := os.Symlink(outside, filepath.Join(storage, "favicons")); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(t.Context(), storage); err == nil {
		t.Fatal("cache directory escaped storage")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := NewStore(ctx, t.TempDir()); !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v, want cancellation", err)
	}
}
