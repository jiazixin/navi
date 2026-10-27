package app

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"navi/internal/catalog"
)

func TestServerStreamsCatalogEvents(t *testing.T) {
	t.Parallel()
	path := writeEventCatalog(t, "version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n")
	store := catalog.NewStore()
	loaded, err := catalog.LoadFile(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(loaded)
	watcher := catalog.NewWatcher(catalog.WatcherOptions{Path: path, Debounce: time.Millisecond, Load: catalog.LoadFile, Store: store, Logger: slog.New(slog.DiscardHandler)})
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Shutdown(t.Context())
	server := newTestServer(t, nil)
	server.catalog = store
	server.watcher = watcher

	httpServer := httptest.NewServer(server)
	defer httpServer.Close()
	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, httpServer.URL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: "test-session"})
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
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
			if strings.TrimSpace(line) == "event: catalog_updated" {
				return
			}
		}
	}
}

func TestServerKeepsSSEOpenPastServerWriteTimeout(t *testing.T) {
	var background sync.WaitGroup
	t.Cleanup(background.Wait)

	t.Parallel()
	path := writeEventCatalog(t, "version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n")
	store := catalog.NewStore()
	loaded, err := catalog.LoadFile(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	store.Publish(loaded)
	watcher := catalog.NewWatcher(catalog.WatcherOptions{Path: path, Debounce: time.Millisecond, Load: catalog.LoadFile, Store: store, Logger: slog.New(slog.DiscardHandler)})
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Shutdown(t.Context())
	server := newTestServer(t, nil)
	server.catalog = store
	server.watcher = watcher
	server.config.Server.WriteTimeout = 30 * time.Millisecond
	server.heartbeat = 50 * time.Millisecond

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	httpServer := &http.Server{Handler: server, WriteTimeout: 30 * time.Millisecond}
	serveDone := make(chan error, 1)
	background.Go(func() { serveDone <- httpServer.Serve(listener) })
	defer func() {
		shutdown, cancelShutdown := context.WithTimeout(context.WithoutCancel(t.Context()), time.Second)
		defer cancelShutdown()
		if err := httpServer.Shutdown(shutdown); err != nil {
			t.Errorf("shutdown SSE server: %v", err)
		}
		if err := <-serveDone; err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Errorf("serve SSE server: %v", err)
		}
	}()

	request, _ := http.NewRequest(http.MethodGet, "http://"+listener.Addr().String()+"/api/events", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: "test-session"})
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
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

func TestEventsHEADReturnsWithoutStreaming(t *testing.T) {
	server := newTestServer(t, nil)
	request := authenticatedRequest(http.MethodHead, "/api/events", nil)
	ctx, cancel := context.WithTimeout(request.Context(), 100*time.Millisecond)
	defer cancel()
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request.WithContext(ctx))
	if ctx.Err() != nil || response.Body.Len() != 0 || response.Code != 200 {
		t.Fatalf("HEAD streamed or waited: %d %q", response.Code, response.Body.String())
	}
}

type blockedStreamWriter struct {
	*httptest.ResponseRecorder
	connection net.Conn
	writing    chan struct{}
}

func (w *blockedStreamWriter) Write(body []byte) (int, error) {
	select {
	case w.writing <- struct{}{}:
	default:
	}
	return w.connection.Write(body)
}

func (w *blockedStreamWriter) SetWriteDeadline(deadline time.Time) error {
	return w.connection.SetWriteDeadline(deadline)
}

func TestEventsInterruptBlockedWrites(t *testing.T) {
	var background sync.WaitGroup
	t.Cleanup(background.Wait)

	for _, cancelWrite := range []bool{false, true} {
		t.Run(fmt.Sprintf("cancel=%t", cancelWrite), func(t *testing.T) {
			server := newTestServer(t, nil)
			server.heartbeat = time.Millisecond
			server.config.Server.WriteTimeout = 20 * time.Millisecond
			if cancelWrite {
				server.config.Server.WriteTimeout = time.Hour
			}
			connection, peer := net.Pipe()
			defer connection.Close()
			defer peer.Close()
			writer := &blockedStreamWriter{ResponseRecorder: httptest.NewRecorder(), connection: connection, writing: make(chan struct{}, 1)}
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			request := authenticatedRequest(http.MethodGet, "/api/events", nil).WithContext(ctx)
			done := make(chan struct{})
			background.Go(func() {
				defer close(done)
				server.ServeHTTP(writer, request)
			})
			select {
			case <-writer.writing:
			case <-time.After(time.Second):
				t.Fatal("stream did not start a write")
			}
			if cancelWrite {
				cancel()
			}
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("stream kept writing to a client that stopped reading")
			}
		})
	}
}

type failedStreamFlusher struct{ *httptest.ResponseRecorder }

func (w failedStreamFlusher) FlushError() error { return io.ErrClosedPipe }

func TestEventsStopAfterFlushFailure(t *testing.T) {
	server := newTestServer(t, nil)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	writer := failedStreamFlusher{httptest.NewRecorder()}
	server.ServeHTTP(writer, authenticatedRequest(http.MethodGet, "/api/events", nil).WithContext(ctx))
	if ctx.Err() != nil {
		t.Fatal("response recorder hid the stream flush failure")
	}
}
