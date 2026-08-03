package httpapi

import (
	"bufio"
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"navi/internal/catalog"
)

func TestServerStreamsCatalogEvents(t *testing.T) {
	t.Parallel()
	path := writeEventCatalog(t, "version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n")
	store := catalog.NewStore()
	loaded, err := catalog.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(loaded)
	watcher := catalog.NewWatcher(path, time.Millisecond, catalog.LoadFile, store)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Stop()
	server := newTestServer(t, nil)
	server.catalog = store
	server.watcher = watcher

	httpServer := httptest.NewServer(server)
	defer httpServer.Close()
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, httpServer.URL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("Content-Type = %q", response.Header.Get("Content-Type"))
	}

	watcher.Publish(catalog.Event{Type: catalog.EventCatalogUpdated, Revision: 2})
	reader := bufio.NewReader(response.Body)
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("timed out waiting for SSE event")
		default:
			line, readErr := reader.ReadString('\n')
			if readErr != nil {
				t.Fatalf("read SSE: %v", readErr)
			}
			if strings.TrimSpace(line) == "event: catalog.updated" {
				return
			}
		}
	}
}

func TestServerKeepsSSEOpenPastServerWriteTimeout(t *testing.T) {
	t.Parallel()
	path := writeEventCatalog(t, "version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n")
	store := catalog.NewStore()
	loaded, err := catalog.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(loaded)
	watcher := catalog.NewWatcher(path, time.Millisecond, catalog.LoadFile, store)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Stop()
	server := newTestServer(t, nil)
	server.catalog = store
	server.watcher = watcher
	server.heartbeat = 10 * time.Millisecond

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	httpServer := &http.Server{Handler: server, WriteTimeout: 30 * time.Millisecond}
	serveDone := make(chan error, 1)
	go func() { serveDone <- httpServer.Serve(listener) }()
	defer func() {
		shutdown, cancelShutdown := context.WithTimeout(context.Background(), time.Second)
		defer cancelShutdown()
		if err := httpServer.Shutdown(shutdown); err != nil {
			t.Errorf("shutdown SSE server: %v", err)
		}
		if err := <-serveDone; err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Errorf("serve SSE server: %v", err)
		}
	}()

	response, err := http.Get("http://" + listener.Addr().String() + "/api/events")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	for range 5 {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("SSE closed before repeated heartbeats: %v", err)
		}
		if strings.TrimSpace(line) != ": heartbeat" {
			t.Fatalf("SSE line = %q, want heartbeat", line)
		}
		if blank, err := reader.ReadString('\n'); err != nil || blank != "\n" {
			t.Fatalf("SSE heartbeat separator = %q, %v", blank, err)
		}
	}
}

func writeEventCatalog(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "urls.yaml")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
