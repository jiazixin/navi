package app

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
	"navi/internal/favicon"
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

	loaded := appTestConfig(t, catalogPath, appConfigOptions{Port: port, Watch: false})
	err = Run(t.Context(), loaded, discardLogger(), "test")
	if err == nil || !strings.Contains(err.Error(), "listen on") {
		t.Fatalf("Run() error = %v, want listen failure", err)
	}
	if _, err := os.Stat(loaded.StorageDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("storage after failed bind: got %v, want no background initialization", err)
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
	loaded := appTestConfig(t, catalogPath, appConfigOptions{Port: port, Watch: false})
	loaded.Server.ShutdownTimeout = 300 * time.Millisecond
	baseURL, stop := startTestApp(t, loaded)

	requestContext, requestCancel := context.WithCancel(t.Context())
	defer requestCancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, baseURL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.AddCookie(appLoginCookie(t, baseURL))
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
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

func TestRunClosesUnusedConnectionsOnShutdown(t *testing.T) {
	t.Parallel()

	catalogPath := writeAppCatalog(t, "Initial")
	port := freeAppPort(t)
	loaded := appTestConfig(t, catalogPath, appConfigOptions{Port: port, Watch: false})
	loaded.Server.ShutdownTimeout = 300 * time.Millisecond
	baseURL, stop := startTestApp(t, loaded)

	// Browsers pre-open spare connections that may never carry a request.
	var dialer net.Dialer
	spare, err := dialer.DialContext(t.Context(), "tcp", strings.TrimPrefix(baseURL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer spare.Close()
	// The server accepts connections in order, so once a request on a later
	// connection completes, the spare connection has been accepted too.
	probe := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	response, err := probe.Get(baseURL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()

	started := time.Now()
	if err := stop(); err != nil {
		t.Fatalf("Run() shutdown error = %v", err)
	}
	if elapsed := time.Since(started); elapsed >= loaded.Server.ShutdownTimeout {
		t.Fatalf("shutdown took %s, should not wait for an unused connection", elapsed)
	}
}

func TestRunHotReloadsCatalogAndReportsDegradedHealth(t *testing.T) {
	t.Parallel()

	catalogPath := writeAppCatalog(t, "Initial")
	port := freeAppPort(t)
	loaded := appTestConfig(t, catalogPath, appConfigOptions{Port: port, Watch: true})
	loaded.Catalog.ReloadDebounce = 20 * time.Millisecond
	baseURL, stop := startTestApp(t, loaded)
	defer func() {
		if err := stop(); err != nil {
			t.Errorf("Run() shutdown error = %v", err)
		}
	}()

	requestContext, requestCancel := context.WithCancel(t.Context())
	defer requestCancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, baseURL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.AddCookie(appLoginCookie(t, baseURL))
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)

	if err := os.WriteFile(catalogPath, []byte("version: [\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if event := awaitAppSSEEvent(t, reader, catalog.EventCatalogError); event.Revision != 1 {
		t.Fatalf("catalog_error revision = %d, want 1", event.Revision)
	}
	status := waitAppStatus(t, baseURL+"/api/status", "degraded")
	if status.Message == "" {
		t.Fatal("degraded status should include a recovery message")
	}

	if err := os.WriteFile(catalogPath, []byte(appCatalogYAML("Recovered")), 0o600); err != nil {
		t.Fatal(err)
	}
	if event := awaitAppSSEEvent(t, reader, catalog.EventCatalogUpdated); event.Revision != 2 {
		t.Fatalf("catalog_updated revision = %d, want 2", event.Revision)
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
	getAppJSON(t, baseURL+"/api/catalog", appJSONOptions{Status: http.StatusOK, Payload: &catalogPayload})
	if catalogPayload.Revision != 2 || len(catalogPayload.Pages) != 1 || catalogPayload.Pages[0].Title != "Recovered" {
		t.Fatalf("catalog after reload = %#v", catalogPayload)
	}
}

func startTestApp(t *testing.T, loaded config.Config) (string, func() error) {
	t.Helper()
	var background sync.WaitGroup
	t.Cleanup(background.Wait)

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	background.Go(func() { done <- Run(ctx, loaded, discardLogger(), "test") })
	waitContext, waitCancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer waitCancel()
	address := net.JoinHostPort(loaded.Server.Listen, fmt.Sprint(loaded.Server.Port))
	if err := waitForPort(waitContext, address); err != nil {
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
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for time.Now().Before(deadline) {
		status = getAppJSON(t, endpoint, appJSONOptions{Status: http.StatusOK, Payload: &appStatus{}})
		if status.Health == health {
			return status
		}
		<-ticker.C
	}
	t.Fatalf("health never became %q; last status = %#v", health, status)
	return appStatus{}
}

func awaitAppSSEEvent(t *testing.T, reader *bufio.Reader, want catalog.EventType) catalog.Event {
	t.Helper()
	var background sync.WaitGroup
	t.Cleanup(background.Wait)

	type result struct {
		event catalog.Event
		err   error
	}
	results := make(chan result, 1)
	background.Go(func() {
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
	})
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

// appJSONOptions groups the inputs for getAppJSON.
type appJSONOptions struct {
	Status  int
	Payload any
}

func getAppJSON(t *testing.T, endpoint string, options appJSONOptions) appStatus {
	t.Helper()
	wantStatus, payload := options.Status, options.Payload

	request, _ := http.NewRequest(http.MethodGet, endpoint, nil)
	parsed, _ := url.Parse(endpoint)
	request.AddCookie(appLoginCookie(t, parsed.Scheme+"://"+parsed.Host))
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
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

// appConfigOptions groups the inputs for appTestConfig.
type appConfigOptions struct {
	Port  int
	Watch bool
}

func appTestConfig(t *testing.T, catalogPath string, options appConfigOptions) config.Config {
	t.Helper()
	port, watch := options.Port, options.Watch

	return config.Config{
		Auth: config.AuthConfig{Username: "tester", PasswordHash: "$2a$10$MH76nh/43WkSzvdsv9cze.Jmxo2eu6fQkcVtBgMvT2IAXwdLje7Gu"},
		Path: filepath.Join(t.TempDir(), "config.yaml"), StorageDir: filepath.Join(t.TempDir(), "storage"),
		Theme: config.ThemeDefault, BackgroundPattern: config.BackgroundPatternContour, WebSearch: config.WebSearchBaidu,
		Server:     config.ServerConfig{Listen: "127.0.0.1", Port: port, ReadHeaderTimeout: time.Second, ReadTimeout: time.Second, WriteTimeout: time.Second, IdleTimeout: time.Second, ShutdownTimeout: time.Second},
		Logging:    config.LoggingConfig{Level: "info", Format: "json"},
		Catalog:    config.CatalogConfig{Path: catalogPath, Watch: watch, ReloadDebounce: 50 * time.Millisecond},
		Navigation: config.NavigationConfig{PrivateProbeTimeout: 100 * time.Millisecond, ProbeCacheTTL: time.Second, MaxConcurrentProbes: 2},
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

func TestPeriodicIconMaintenanceWithoutCatalogWatcher(t *testing.T) {
	icon, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQSFjwHwAD5AIge4YO3AAAAABJRU5ErkJggg==")
	if err != nil {
		t.Fatal(err)
	}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/favicon.ico" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(icon)
			return
		}
		_, _ = w.Write([]byte("<html></html>"))
	}))
	defer target.Close()
	icons, err := favicon.NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manager, err := favicon.NewManager(favicon.Config{FetchTimeout: time.Second, RefreshInterval: time.Hour, MaxFileBytes: 1024, Workers: 1}, icons, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	if err := manager.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer manager.Shutdown(t.Context())
	store := catalog.NewStore()
	store.Publish(catalog.Catalog{Pages: []catalog.Page{{Groups: []catalog.Group{{Links: []catalog.Link{{RuntimeID: "periodic", PublicURL: target.URL}}}}}}})
	var workers sync.WaitGroup
	done := observeCatalogEvents(ctx, catalogObserverOptions{Store: store, Manager: manager, Logger: discardLogger(), RefreshInterval: 10 * time.Millisecond, Workers: &workers})
	defer func() {
		cancel()
		<-done
		workers.Wait()
	}()
	deadline := time.After(2 * time.Second)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-deadline:
			t.Fatal("periodic maintenance did not fetch icon")
		case <-ticker.C:
			if _, ok := icons.Entry(t.Context(), "periodic"); ok {
				return
			}
		}
	}
}

func appLoginCookie(t *testing.T, baseURL string) *http.Cookie {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, baseURL+"/api/auth/login", strings.NewReader(`{"username":"tester","password":"test-password"}`))
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	if res.StatusCode != 200 || len(res.Cookies()) == 0 {
		t.Fatalf("login failed: %d", res.StatusCode)
	}
	return res.Cookies()[0]
}

// waitForPort waits until a TCP address can accept connections. It is used by integration tests.
func waitForPort(ctx context.Context, address string) error {
	for {
		connection, err := net.DialTimeout("tcp", address, 50*time.Millisecond)
		if err == nil {
			if closeErr := connection.Close(); closeErr != nil {
				return fmt.Errorf("close readiness connection: %w", closeErr)
			}
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}
}
