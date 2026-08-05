package app

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
)

func TestRunFailsBeforeListeningWhenPortIsUnavailable(t *testing.T) {
	t.Parallel()

	catalogPath := writeAppCatalog(t, "Initial")
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer occupied.Close()
	port := occupied.Addr().(*net.TCPAddr).Port

	loaded := appTestConfig(t, catalogPath, port, false)
	err = Run(context.Background(), loaded, discardLogger())
	if err == nil || !strings.Contains(err.Error(), "listen on") {
		t.Fatalf("Run() error = %v, want listen failure", err)
	}
	if err := occupied.Close(); err != nil {
		t.Fatal(err)
	}
	probe, err := net.Listen("tcp", net.JoinHostPort(loaded.Server.Listen, fmt.Sprint(port)))
	if err != nil {
		t.Fatalf("port remained unexpectedly unavailable after failed startup: %v", err)
	}
	probe.Close()
}

func TestRunGracefullyClosesPersistentSSEOnCancellation(t *testing.T) {
	t.Parallel()

	catalogPath := writeAppCatalog(t, "Initial")
	port := freeAppPort(t)
	loaded := appTestConfig(t, catalogPath, port, false)
	loaded.Server.ShutdownTimeout = 300 * time.Millisecond
	baseURL, stop := startTestApp(t, loaded)

	requestContext, requestCancel := context.WithCancel(context.Background())
	defer requestCancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, baseURL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("SSE status = %d, want 200", response.StatusCode)
	}

	started := time.Now()
	if err := stop(); err != nil {
		t.Fatalf("Run() shutdown error = %v", err)
	}
	if elapsed := time.Since(started); elapsed >= loaded.Server.ShutdownTimeout {
		t.Fatalf("shutdown took %s, should cancel persistent SSE before deadline %s", elapsed, loaded.Server.ShutdownTimeout)
	}
	requestCancel()
}

func TestRunHotReloadsCatalogAndReportsDegradedHealth(t *testing.T) {
	t.Parallel()

	catalogPath := writeAppCatalog(t, "Initial")
	port := freeAppPort(t)
	loaded := appTestConfig(t, catalogPath, port, true)
	loaded.Catalog.ReloadDebounce = 20 * time.Millisecond
	baseURL, stop := startTestApp(t, loaded)
	defer func() {
		if err := stop(); err != nil {
			t.Errorf("Run() shutdown error = %v", err)
		}
	}()

	requestContext, requestCancel := context.WithCancel(context.Background())
	defer requestCancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, baseURL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)

	if err := os.WriteFile(catalogPath, []byte("version: [\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if event := awaitAppSSEEvent(t, reader, catalog.EventCatalogError); event.Revision != 1 {
		t.Fatalf("catalog.error revision = %d, want 1", event.Revision)
	}
	status := waitAppStatus(t, baseURL+"/api/status", "degraded")
	if status.Message == "" {
		t.Fatal("degraded status should include a recovery message")
	}

	if err := os.WriteFile(catalogPath, []byte(appCatalogYAML("Recovered")), 0o600); err != nil {
		t.Fatal(err)
	}
	if event := awaitAppSSEEvent(t, reader, catalog.EventCatalogUpdated); event.Revision != 2 {
		t.Fatalf("catalog.updated revision = %d, want 2", event.Revision)
	}
	status = waitAppStatus(t, baseURL+"/api/status", "ok")
	if status.Revision != 2 {
		t.Fatalf("recovered status revision = %d, want 2", status.Revision)
	}
	var catalogPayload struct {
		Revision uint64 `json:"revision"`
		Pages    []struct {
			Title string `json:"title"`
		} `json:"pages"`
	}
	getAppJSON(t, baseURL+"/api/catalog", http.StatusOK, &catalogPayload)
	if catalogPayload.Revision != 2 || len(catalogPayload.Pages) != 1 || catalogPayload.Pages[0].Title != "Recovered" {
		t.Fatalf("catalog after reload = %#v", catalogPayload)
	}
}

func startTestApp(t *testing.T, loaded config.Config) (string, func() error) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- Run(ctx, loaded, discardLogger()) }()
	waitContext, waitCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer waitCancel()
	address := net.JoinHostPort(loaded.Server.Listen, fmt.Sprint(loaded.Server.Port))
	if err := WaitForPort(waitContext, address); err != nil {
		cancel()
		select {
		case runErr := <-done:
			t.Fatalf("app failed to start: %v (wait error: %v)", runErr, err)
		case <-time.After(time.Second):
			t.Fatalf("app failed to start: %v", err)
		}
	}
	var once sync.Once
	var stopErr error
	stop := func() error {
		once.Do(func() {
			cancel()
			select {
			case stopErr = <-done:
			case <-time.After(2 * time.Second):
				stopErr = errors.New("timed out waiting for app shutdown")
			}
		})
		return stopErr
	}
	return "http://" + address, stop
}

type appStatus struct {
	Health   string `json:"health"`
	Revision uint64 `json:"revision"`
	Message  string `json:"message"`
}

func waitAppStatus(t *testing.T, endpoint, health string) appStatus {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var status appStatus
	for time.Now().Before(deadline) {
		status = getAppJSON(t, endpoint, http.StatusOK, &appStatus{})
		if status.Health == health {
			return status
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("health never became %q; last status = %#v", health, status)
	return appStatus{}
}

func awaitAppSSEEvent(t *testing.T, reader *bufio.Reader, want catalog.EventType) catalog.Event {
	t.Helper()
	type result struct {
		event catalog.Event
		err   error
	}
	results := make(chan result, 1)
	go func() {
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				results <- result{err: err}
				return
			}
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "event: ") || strings.TrimPrefix(line, "event: ") != string(want) {
				continue
			}
			data, err := reader.ReadString('\n')
			if err != nil {
				results <- result{err: err}
				return
			}
			if !strings.HasPrefix(strings.TrimSpace(data), "data: ") {
				results <- result{err: fmt.Errorf("SSE event %q missing data", want)}
				return
			}
			var event catalog.Event
			if err := json.Unmarshal([]byte(strings.TrimPrefix(strings.TrimSpace(data), "data: ")), &event); err != nil {
				results <- result{err: err}
				return
			}
			results <- result{event: event}
			return
		}
	}()
	select {
	case result := <-results:
		if result.err != nil {
			t.Fatalf("read SSE event %q: %v", want, result.err)
		}
		return result.event
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for SSE event %q", want)
		return catalog.Event{}
	}
}

func getAppJSON(t *testing.T, endpoint string, wantStatus int, payload any) appStatus {
	t.Helper()
	response, err := http.Get(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		t.Fatalf("GET %s status = %d, want %d", endpoint, response.StatusCode, wantStatus)
	}
	contents, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(contents, payload); err != nil {
		t.Fatalf("decode %s: %v (%s)", endpoint, err, contents)
	}
	if status, ok := payload.(*appStatus); ok {
		return *status
	}
	return appStatus{}
}

func appTestConfig(t *testing.T, catalogPath string, port int, watch bool) config.Config {
	t.Helper()
	return config.Config{
		Path: filepath.Join(t.TempDir(), "config.yaml"), DataDir: filepath.Join(t.TempDir(), "data"),
		Theme: config.ThemeDefault, BackgroundPattern: config.BackgroundPatternMeridianGrid, WebSearch: config.WebSearchBaidu,
		Server:     config.ServerConfig{Listen: "127.0.0.1", Port: port, ReadHeaderTimeout: time.Second, ReadTimeout: time.Second, WriteTimeout: time.Second, IdleTimeout: time.Second, ShutdownTimeout: time.Second},
		Health:     config.HealthConfig{URI: "/health"},
		Logging:    config.LoggingConfig{Level: "info", Format: "json"},
		Catalog:    config.CatalogConfig{Path: catalogPath, Watch: watch, ReloadDebounce: 50 * time.Millisecond},
		Navigation: config.NavigationConfig{PrivateProbeTimeout: 100 * time.Millisecond, PublicProbeTimeout: 100 * time.Millisecond, ProbeCacheTTL: time.Second, MaxConcurrentProbes: 2},
		Favicon:    config.FaviconConfig{FetchTimeout: 100 * time.Millisecond, RefreshInterval: time.Hour, MaxFileBytes: 1_024, Workers: 1},
	}
}

func writeAppCatalog(t *testing.T, title string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "urls.yaml")
	if err := os.WriteFile(path, []byte(appCatalogYAML(title)), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func appCatalogYAML(title string) string {
	return fmt.Sprintf("version: 1\npages:\n  - id: page1\n    title: %s\n    urls: []\n", title)
}

func freeAppPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
