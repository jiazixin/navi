package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"navi/internal/catalog"
	"navi/internal/config"
)

func TestServerReportsUnavailableWhenCatalogHasNoSnapshot(t *testing.T) {
	t.Parallel()

	store := catalog.NewStore()
	server, err := New(Options{
		Config:  config.Config{Health: config.HealthConfig{URI: "/health"}},
		Catalog: store,
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, route := range []string{"/api/catalog", "/api/status", "/health"} {
		t.Run(route, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, route, nil))
			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("GET %s status = %d, want 503", route, recorder.Code)
			}
			if recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("GET %s Cache-Control = %q, want no-store", route, recorder.Header().Get("Cache-Control"))
			}
		})
	}
}

func TestServerReportsDegradedStatusWhileServingLastSnapshot(t *testing.T) {
	t.Parallel()

	server := newTestServer(t, nil)
	server.degraded = func() (bool, string) {
		return true, "temporary catalog failure"
	}

	status := httptest.NewRecorder()
	server.ServeHTTP(status, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if status.Code != http.StatusOK {
		t.Fatalf("status response = %d, want 200", status.Code)
	}
	var payload struct {
		Health   string `json:"health"`
		Revision uint64 `json:"revision"`
		Message  string `json:"message"`
	}
	if err := json.Unmarshal(status.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Health != "degraded" || payload.Revision == 0 || payload.Message != "temporary catalog failure" {
		t.Fatalf("status payload = %#v", payload)
	}

	health := httptest.NewRecorder()
	server.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/health", nil))
	if health.Code != http.StatusOK || strings.TrimSpace(health.Body.String()) != "degraded" {
		t.Fatalf("health response = %d %q", health.Code, health.Body.String())
	}
}

func TestServerRejectsWritesAndDoesNotTreatUnknownAPIRoutesAsSPA(t *testing.T) {
	t.Parallel()
	server := newTestServer(t, nil)

	tests := []struct {
		name       string
		method     string
		path       string
		status     int
		allow      string
		bodyString string
	}{
		{name: "options", method: http.MethodOptions, path: "/api/catalog", status: http.StatusNoContent},
		{name: "put catalog", method: http.MethodPut, path: "/api/catalog", status: http.StatusMethodNotAllowed, allow: "GET, HEAD, OPTIONS"},
		{name: "post navigation", method: http.MethodPost, path: "/go/one", status: http.StatusMethodNotAllowed, allow: "GET, HEAD, OPTIONS"},
		{name: "unknown api", method: http.MethodGet, path: "/api/not-found", status: http.StatusNotFound},
		{name: "empty icon id", method: http.MethodGet, path: "/api/icons/", status: http.StatusNotFound},
		{name: "nested icon id", method: http.MethodGet, path: "/api/icons/one/secret", status: http.StatusNotFound},
		{name: "empty navigation id", method: http.MethodGet, path: "/go/", status: http.StatusNotFound},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			server.ServeHTTP(recorder, httptest.NewRequest(test.method, test.path, nil))
			if recorder.Code != test.status {
				t.Fatalf("%s %s status = %d, want %d", test.method, test.path, recorder.Code, test.status)
			}
			if test.allow != "" && recorder.Header().Get("Allow") != test.allow {
				t.Fatalf("Allow = %q, want %q", recorder.Header().Get("Allow"), test.allow)
			}
			if test.bodyString != "" && strings.TrimSpace(recorder.Body.String()) != test.bodyString {
				t.Fatalf("body = %q, want %q", recorder.Body.String(), test.bodyString)
			}
		})
	}
}

func TestServerHealthHEADAndStaticTraversalFallback(t *testing.T) {
	t.Parallel()
	server := newTestServer(t, nil)

	health := httptest.NewRecorder()
	server.ServeHTTP(health, httptest.NewRequest(http.MethodHead, "/health", nil))
	if health.Code != http.StatusOK || health.Body.Len() != 0 {
		t.Fatalf("HEAD /health = %d body=%q, want 200 and empty body", health.Code, health.Body.String())
	}

	traversal := httptest.NewRecorder()
	server.ServeHTTP(traversal, httptest.NewRequest(http.MethodGet, "/../../etc/passwd", nil))
	if traversal.Code != http.StatusOK || traversal.Body.String() != "<main>Navi</main>" {
		t.Fatalf("traversal fallback = %d %q, want SPA fallback", traversal.Code, traversal.Body.String())
	}
}

func TestNewRequiresCatalogStore(t *testing.T) {
	t.Parallel()
	_, err := New(Options{})
	if err == nil || !strings.Contains(err.Error(), "catalog store") {
		t.Fatalf("New() error = %v, want missing catalog dependency", err)
	}
}

func TestServerDoesNotExposeInternalFailureDetails(t *testing.T) {
	t.Parallel()
	server := newTestServer(t, nil)
	server.resolver = nil
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/go/one", nil))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("navigation unavailable status = %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "internal") || strings.Contains(recorder.Body.String(), "/Users/") {
		t.Fatalf("failure page leaks internal details: %q", recorder.Body.String())
	}

	// Exercise the JSON error path too; it should remain a short user-facing message.
	unknown := httptest.NewRecorder()
	server.ServeHTTP(unknown, httptest.NewRequest(http.MethodGet, "/api/nope?token=secret", nil))
	contents, err := io.ReadAll(unknown.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(contents), "secret") {
		t.Fatalf("API error leaks query parameters: %q", contents)
	}
}
