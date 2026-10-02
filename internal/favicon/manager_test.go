package favicon

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"navi/internal/catalog"
)

func TestManagerUsesConditionalValidatorsAndHandlesNotModified(t *testing.T) {
	t.Parallel()
	var conditionalETag atomic.Value
	var conditionalLastModified atomic.Value
	var iconRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/page":
			writer.Header().Set("Content-Type", "text/html")
			_, _ = writer.Write([]byte(`<link rel="icon" href="/favicon.png">`))
		case "/favicon.png":
			iconRequests.Add(1)
			conditionalETag.Store(request.Header.Get("If-None-Match"))
			conditionalLastModified.Store(request.Header.Get("If-Modified-Since"))
			if request.Header.Get("If-None-Match") == `"remote-v1"` {
				writer.Header().Set("ETag", `"remote-v1"`)
				writer.Header().Set("Last-Modified", "Wed, 01 Jan 2025 00:00:00 GMT")
				writer.WriteHeader(http.StatusNotModified)
				return
			}
			writer.Header().Set("Content-Type", "image/png")
			writer.Header().Set("ETag", `"remote-v1"`)
			writer.Header().Set("Last-Modified", "Wed, 01 Jan 2025 00:00:00 GMT")
			_, _ = writer.Write([]byte("\x89PNG\r\n\x1a\nicon"))
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	store, err := NewStore(t.TempDir())
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
	entry, ok := store.Entry("one")
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
	refreshed, _ := store.Entry("one")
	if !refreshed.FetchedAt.After(entry.FetchedAt) {
		t.Fatalf("304 refresh did not update fetched_at: before=%s after=%s", entry.FetchedAt, refreshed.FetchedAt)
	}
}

func TestManagerDeduplicatesConcurrentDiscoveryBySource(t *testing.T) {
	t.Parallel()
	var requests atomic.Int32
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		<-release
		writer.Header().Set("Content-Type", "text/html")
		_, _ = writer.Write([]byte(`<link rel="icon" href="/favicon.png">`))
	}))
	defer server.Close()
	store, err := NewStore(t.TempDir())
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
		go func() {
			start.Done()
			_, err := manager.discover(t.Context(), pageURL)
			results <- err
		}()
	}
	start.Wait()
	deadline := time.After(time.Second)
	for requests.Load() == 0 {
		select {
		case <-deadline:
			t.Fatal("discovery request did not start")
		default:
			time.Sleep(time.Millisecond)
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
	store, err := NewStore(t.TempDir())
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
		_, _ = w.Write([]byte("\x89PNG\r\n\x1a\nicon"))
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
	if _, ok := store.Entry("one"); !ok {
		t.Fatal("root icon not stored")
	}
	if event := <-events; event.Type != catalog.EventStatusUpdated {
		t.Fatalf("recovery event = %+v", event)
	}
}
