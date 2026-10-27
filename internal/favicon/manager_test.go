package favicon

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"navi/internal/catalog"
)

func TestManagerRepairsMissingFreshCacheWithoutConditionalRequest(t *testing.T) {
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var conditional atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/favicon.ico" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		conditional.Store(r.Header.Get("If-None-Match") != "")
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(testPNG(t))
	}))
	defer target.Close()
	entry, err := store.Put(t.Context(), WriteRequest{RuntimeID: "one", SourceURL: target.URL + "/favicon.ico", ContentType: "image/png", SourceETag: `"old"`, LastModified: "", Body: []byte("old")})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(store.directory, entry.fileName)); err != nil {
		t.Fatal(err)
	}
	manager, err := NewManager(Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, store, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	defer manager.Shutdown(t.Context())
	link := catalog.Link{RuntimeID: "one", PublicURL: target.URL}
	if !manager.shouldFetch(t.Context(), "one") {
		t.Fatal("fresh metadata suppressed download after blob removal")
	}
	manager.fetch(t.Context(), link)
	if _, body, err := readCachedIcon(t.Context(), store, "one"); err != nil || !bytes.Equal(body, testPNG(t)) || conditional.Load() {
		t.Fatalf("cache repair body=%q, err=%v, conditional=%v", body, err, conditional.Load())
	}
}

func TestManagerReDownloadsOldInvalidCacheAfterRestart(t *testing.T) {
	directory := t.TempDir()
	store, err := NewStore(t.Context(), directory)
	if err != nil {
		t.Fatal(err)
	}
	var conditional atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/favicon.ico" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.Header.Get("If-None-Match") != "" {
			conditional.Store(true)
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(testPNG(t))
	}))
	defer target.Close()
	if _, err := store.Put(t.Context(), WriteRequest{RuntimeID: "one", SourceURL: target.URL + "/favicon.ico", ContentType: "image/png", SourceETag: `"old"`, LastModified: "", Body: []byte("\x89PNG\r\n\x1a\ninvalid")}); err != nil {
		t.Fatal(err)
	}
	reopened, err := NewStore(t.Context(), directory)
	if err != nil {
		t.Fatal(err)
	}
	events := make(chan catalog.Event, 1)
	manager, err := NewManager(Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, reopened, func(event catalog.Event) { events <- event })
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	defer manager.Shutdown(t.Context())
	if err := manager.Schedule(t.Context(), catalog.Catalog{Pages: []catalog.Page{{Groups: []catalog.Group{{Links: []catalog.Link{{RuntimeID: "one", PublicURL: target.URL}}}}}}}); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-events:
		if event.Type != catalog.EventFaviconUpdated {
			t.Fatalf("scheduled repair event = %+v", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("startup revalidation did not schedule a replacement")
	}
	if _, body, err := readCachedIcon(t.Context(), reopened, "one"); err != nil || !bytes.Equal(body, testPNG(t)) || conditional.Load() {
		t.Fatalf("restart repair body=%x, err=%v, conditional=%v", body, err, conditional.Load())
	}
}

func TestManagerRepairsCacheDeletedDuringConditionalRefresh(t *testing.T) {
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var cachedFile string
	var requests atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/favicon.ico" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		requests.Add(1)
		if r.Header.Get("If-None-Match") != "" {
			if err := os.Remove(cachedFile); err != nil {
				t.Error(err)
			}
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(testPNG(t))
	}))
	defer target.Close()
	entry, err := store.Put(t.Context(), WriteRequest{RuntimeID: "one", SourceURL: target.URL + "/favicon.ico", ContentType: "image/png", SourceETag: `"old"`, LastModified: "", Body: []byte("old")})
	if err != nil {
		t.Fatal(err)
	}
	cachedFile = filepath.Join(store.directory, entry.fileName)
	manager, err := NewManager(Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, store, nil)
	if err != nil {
		t.Fatal(err)
	}
	manager.fetch(t.Context(), catalog.Link{RuntimeID: "one", PublicURL: target.URL})
	if _, body, err := readCachedIcon(t.Context(), store, "one"); err != nil || !bytes.Equal(body, testPNG(t)) || requests.Load() != 2 {
		t.Fatalf("cache repair body=%q, err=%v, requests=%d", body, err, requests.Load())
	}
	if degraded, _ := manager.Degraded(); degraded {
		t.Fatal("successful redownload left cache degraded")
	}
}

func TestManagerSkipsUnsolicitedNotModifiedResponse(t *testing.T) {
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			_, _ = w.Write([]byte(`<link rel="icon" href="/invalid.png">`))
		case "/invalid.png":
			w.WriteHeader(http.StatusNotModified)
		case "/favicon.ico":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(testPNG(t))
		}
	}))
	defer target.Close()
	manager, err := NewManager(Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, store, nil)
	if err != nil {
		t.Fatal(err)
	}
	manager.fetch(t.Context(), catalog.Link{RuntimeID: "one", PublicURL: target.URL})
	entry, ok := store.Entry(t.Context(), "one")
	if !ok || entry.SourceURL != target.URL+"/favicon.ico" {
		t.Fatalf("unsolicited 304 prevented root fallback: %+v", entry)
	}
	if degraded, _ := manager.Degraded(); degraded {
		t.Fatal("remote unsolicited 304 degraded local storage")
	}
}

func TestManagerNegotiatesSupportedImageAndSkipsMalformedCandidate(t *testing.T) {
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			_, _ = w.Write([]byte(`<link rel="icon" href="/broken.png">`))
		case "/broken.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("\x89PNG\r\n\x1a\ntruncated"))
		case "/favicon.ico":
			if strings.Contains(r.Header.Get("Accept"), "image/avif") {
				w.Header().Set("Content-Type", "image/avif")
				_, _ = w.Write([]byte("unsupported AVIF response"))
				return
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(testPNG(t))
		}
	}))
	defer target.Close()
	manager, err := NewManager(Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, store, nil)
	if err != nil {
		t.Fatal(err)
	}
	manager.fetch(t.Context(), catalog.Link{RuntimeID: "one", PublicURL: target.URL})
	entry, body, err := readCachedIcon(t.Context(), store, "one")
	if err != nil || entry.SourceURL != target.URL+"/favicon.ico" || !bytes.Equal(body, testPNG(t)) {
		t.Fatalf("negotiated icon = %+v, err=%v", entry, err)
	}
}

func TestManagerUsesConditionalValidatorsAndHandlesNotModified(t *testing.T) {
	t.Parallel()
	var conditionalETag atomic.Value
	var conditionalLastModified atomic.Value
	var iconRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/page":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<link rel="icon" href="/favicon.png">`))
		case "/favicon.png":
			iconRequests.Add(1)
			conditionalETag.Store(r.Header.Get("If-None-Match"))
			conditionalLastModified.Store(r.Header.Get("If-Modified-Since"))
			if r.Header.Get("If-None-Match") == `"remote-v1"` {
				w.Header().Set("ETag", `"remote-v1"`)
				w.Header().Set("Last-Modified", "Wed, 01 Jan 2025 00:00:00 GMT")
				w.WriteHeader(http.StatusNotModified)
				return
			}
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("ETag", `"remote-v1"`)
			w.Header().Set("Last-Modified", "Wed, 01 Jan 2025 00:00:00 GMT")
			_, _ = w.Write(testPNG(t))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	events := make(chan catalog.Event, 2)
	manager, err := NewManager(Config{
		FetchTimeout: 2 * time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1,
	}, store, func(event catalog.Event) { events <- event })
	if err != nil {
		t.Fatal(err)
	}
	link := catalog.Link{RuntimeID: "one", PublicURL: server.URL + "/page"}
	manager.fetch(t.Context(), link)
	entry, ok := store.Entry(t.Context(), "one")
	if !ok || entry.SourceETag != `"remote-v1"` {
		t.Fatalf("entry after initial fetch = %#v, ok=%v", entry, ok)
	}
	if event := <-events; event.RuntimeID != "one" {
		t.Fatalf("favicon event = %#v", event)
	}

	store.mu.Lock()
	entry.FetchedAt = time.Now().Add(-2 * time.Hour)
	store.entries["one"] = entry
	store.mu.Unlock()
	manager.fetch(t.Context(), link)
	if got := iconRequests.Load(); got != 2 {
		t.Fatalf("icon requests = %d, want 2", got)
	}
	if got := conditionalETag.Load(); got != `"remote-v1"` {
		t.Fatalf("If-None-Match = %q", got)
	}
	if got := conditionalLastModified.Load(); got != "Wed, 01 Jan 2025 00:00:00 GMT" {
		t.Fatalf("If-Modified-Since = %q", got)
	}
	select {
	case event := <-events:
		t.Fatalf("304 refresh should not publish an update: %#v", event)
	default:
	}
	refreshed, _ := store.Entry(t.Context(), "one")
	if !refreshed.FetchedAt.After(entry.FetchedAt) {
		t.Fatalf("304 refresh did not update fetched_at: before=%s after=%s", entry.FetchedAt, refreshed.FetchedAt)
	}
}

func TestManagerDeduplicatesConcurrentDiscoveryBySource(t *testing.T) {
	var background sync.WaitGroup
	t.Cleanup(background.Wait)

	t.Parallel()
	var requests atomic.Int32
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		<-release
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<link rel="icon" href="/favicon.png">`))
	}))
	defer server.Close()
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manager, err := NewManager(Config{
		FetchTimeout: 2 * time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1,
	}, store, nil)
	if err != nil {
		t.Fatal(err)
	}
	pageURL := server.URL + "/page"
	results := make(chan error, 2)
	var start sync.WaitGroup
	start.Add(2)
	for range 2 {
		background.Go(func() {
			start.Done()
			_, err := manager.discover(t.Context(), pageURL)
			results <- err
		})
	}
	start.Wait()
	deadline := time.After(time.Second)
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for requests.Load() == 0 {
		select {
		case <-deadline:
			t.Fatal("discovery request did not start")
		case <-ticker.C:
		}
	}
	close(release)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("discovery requests = %d, want 1", got)
	}
}

func TestManagerReportsStorageFailureAndRecovery(t *testing.T) {
	store, err := NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	events := make(chan catalog.Event, 10)
	manager, err := NewManager(Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, store, func(e catalog.Event) { events <- e })
	if err != nil {
		t.Fatal(err)
	}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/favicon.ico" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(testPNG(t))
	}))
	defer target.Close()
	// Replacing the cache directory with a regular file fails writes even under root.
	if err := os.Remove(store.directory); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.directory, []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	link := catalog.Link{RuntimeID: "one", PublicURL: target.URL}
	manager.fetch(t.Context(), link)
	if degraded, message := manager.Degraded(); !degraded || strings.Contains(message, store.directory) {
		t.Fatalf("health = %v, %q", degraded, message)
	}
	if event := <-events; event.Type != catalog.EventStatusUpdated {
		t.Fatalf("event = %+v", event)
	}
	// A different successful write must not erase this link's failure.
	manager.recordStorageResult("other", nil)
	if degraded, _ := manager.Degraded(); !degraded {
		t.Fatal("unrelated success cleared failure")
	}
	if err := os.Remove(store.directory); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(store.directory, 0750); err != nil {
		t.Fatal(err)
	}
	manager.fetch(t.Context(), link)
	if degraded, _ := manager.Degraded(); degraded {
		t.Fatal("health did not recover")
	}
	if _, ok := store.Entry(t.Context(), "one"); !ok {
		t.Fatal("root icon not stored")
	}
	if event := <-events; event.Type != catalog.EventStatusUpdated {
		t.Fatalf("recovery event = %+v", event)
	}
}
