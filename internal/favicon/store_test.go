package favicon

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// readCachedIcon returns an in-memory copy of one cached icon.
func readCachedIcon(store *Store, runtimeID string) (Entry, []byte, error) {
	entry, file, err := store.Open(runtimeID)
	if err != nil {
		return Entry{}, nil, err
	}
	defer file.Close()
	contents, err := io.ReadAll(file)
	if err != nil {
		return Entry{}, nil, err
	}
	return entry, contents, nil
}

func TestStorePersistsAndReloadsValidatedEntries(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	validImage := testPNG(t)
	created, err := store.Put("example", "https://example.test/favicon.png", "image/png", "", "", validImage)
	if err != nil {
		t.Fatal(err)
	}
	entry, contents, err := readCachedIcon(store, "example")
	if err != nil {
		t.Fatal(err)
	}
	if entry.ETag != created.ETag || !bytes.Equal(contents, validImage) {
		t.Fatalf("entry = %#v, contents = %q", entry, contents)
	}

	reopened, err := NewStore(store.directory[:len(store.directory)-len("favicons")])
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := readCachedIcon(reopened, "example"); err != nil {
		t.Fatalf("reopened store did not load entry: %v", err)
	}
	_, _, err = readCachedIcon(reopened, "missing")
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
	if _, err := store.Put("one", "https://example.test/icon", "image/svg+xml", "", "", []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`)); err != nil {
		t.Fatal(err)
	}
	var work sync.WaitGroup
	for worker := range 8 {
		work.Go(func() {
			for iteration := range 20 {
				body := []byte(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg"><text>%d %d</text></svg>`, worker, iteration))
				if _, err := store.Put("one", "https://example.test/icon", "image/svg+xml", "", "", body); err != nil {
					t.Error(err)
					return
				}
				entry, body, err := readCachedIcon(store, "one")
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
	persisted, body, err := readCachedIcon(reopened, "one")
	if err != nil || persisted.ETag != current.ETag {
		t.Fatalf("persisted entry disagrees with current entry: %v", err)
	}
	digest := sha256.Sum256(body)
	if persisted.ETag != `"`+hex.EncodeToString(digest[:])+`"` {
		t.Fatal("persisted metadata and image disagree")
	}
}

func TestStoreReloadRejectsOldMalformedAndOversizedBlobsWithoutDeletingFiles(t *testing.T) {
	var oversizedImage bytes.Buffer
	if err := png.Encode(&oversizedImage, image.NewRGBA(image.Rect(0, 0, maxIconDimension+1, 1))); err != nil {
		t.Fatal(err)
	}
	for _, testCase := range []struct {
		name        string
		contentType string
		body        []byte
	}{
		{"malformed", "image/png", []byte("\x89PNG\r\n\x1a\nold")},
		{"dimensions", "image/png", oversizedImage.Bytes()},
		{"bytes", "image/svg+xml", []byte(`<svg><!--` + strings.Repeat("x", maxCachedIconBytes) + `--></svg>`)},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			directory := t.TempDir()
			store, err := NewStore(directory)
			if err != nil {
				t.Fatal(err)
			}
			// Put is the persistence boundary; simulate metadata written by an old
			// version that accepted MIME signatures without the current checks.
			entry, err := store.Put("old", "https://example.test/icon", testCase.contentType, `"remote-old"`, "", testCase.body)
			if err != nil {
				t.Fatal(err)
			}
			reopened, err := NewStore(directory)
			if err != nil {
				t.Fatal(err)
			}
			if _, ok := reopened.Entry("old"); ok {
				t.Fatal("old invalid icon entered the index and could receive a 304 refresh")
			}
			if _, err := os.Stat(filepath.Join(store.directory, entry.fileName)); err != nil {
				t.Fatalf("revalidation deleted the old blob: %v", err)
			}
			if _, err := os.Stat(filepath.Join(store.directory, metadataName("old"))); err != nil {
				t.Fatalf("revalidation deleted the old metadata: %v", err)
			}
		})
	}
}
