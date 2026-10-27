package app

import (
	"encoding/json/v2"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
)

func TestServerReportsUnavailableWhenCatalogHasNoSnapshot(t *testing.T) {
	t.Parallel()

	store := catalog.NewStore()
	server, err := newHTTPServer(httpOptions{
		Config:  config.Config{},
		Catalog: store,
	})
	if err != nil {
		t.Fatal(err)
	}

	server.auth.sessions[sessionDigest("test-session")] = time.Now().Add(time.Hour)
	for _, route := range []string{"/api/catalog", "/api/status", "/healthz"} {
		t.Run(route, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			server.ServeHTTP(recorder, authenticatedRequest(http.MethodGet, route, nil))
			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("GET %s status = %d, want 503", route, recorder.Code)
			}
			if recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("GET %s Cache-Control = %q, want no-store", route, recorder.Header().Get("Cache-Control"))
			}
			var failure apiError
			if err := json.Unmarshal(recorder.Body.Bytes(), &failure); err != nil || failure.Error.Code != "catalog_unavailable" {
				t.Fatalf("GET %s body = %q, error = %v, want the catalog_unavailable error envelope", route, recorder.Body.String(), err)
			}
		})
	}
}

func TestServerReportsDegradedStatusWhileServingLastSnapshot(t *testing.T) {
	t.Parallel()

	server := newTestServer(t, nil)
	server.degraded = func() (bool, string) {
		return true, statusIconCacheUnavailable
	}

	status := httptest.NewRecorder()
	server.ServeHTTP(status, authenticatedRequest(http.MethodGet, "/api/status", nil))
	if status.Code != http.StatusOK {
		t.Fatalf("status response = %d, want 200", status.Code)
	}
	var payload struct {
		Health   string `json:"health"`
		Revision uint64 `json:"revision"`
		Code     string `json:"code"`
		Message  string `json:"message"`
	}
	if err := json.Unmarshal(status.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Health != "degraded" || payload.Revision == 0 || payload.Code != statusIconCacheUnavailable || payload.Message == "" {
		t.Fatalf("status payload = %#v", payload)
	}

	health := httptest.NewRecorder()
	server.ServeHTTP(health, authenticatedRequest(http.MethodGet, "/healthz", nil))
	// A degraded service still serves; the cause is only in /api/status.
	if health.Code != http.StatusOK || strings.TrimSpace(health.Body.String()) != `{"status":"ok"}` {
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
		{name: "put catalog", method: http.MethodPut, path: "/api/catalog", status: http.StatusMethodNotAllowed, allow: "GET, HEAD"},
		{name: "post navigation", method: http.MethodPost, path: "/go/one", status: http.StatusMethodNotAllowed, allow: "GET, HEAD"},
		{name: "unknown api", method: http.MethodGet, path: "/api/not-found", status: http.StatusNotFound},
		{name: "empty icon id", method: http.MethodGet, path: "/api/icons/", status: http.StatusNotFound},
		{name: "nested icon id", method: http.MethodGet, path: "/api/icons/one/secret", status: http.StatusNotFound},
		{name: "empty navigation id", method: http.MethodGet, path: "/go/", status: http.StatusNotFound},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			server.ServeHTTP(recorder, authenticatedRequest(test.method, test.path, nil))
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
	server.ServeHTTP(health, authenticatedRequest(http.MethodHead, "/healthz", nil))
	// net/http drops the body of a HEAD response on the wire.
	if health.Code != http.StatusOK {
		t.Fatalf("HEAD /healthz = %d, want 200", health.Code)
	}

	traversal := httptest.NewRecorder()
	server.ServeHTTP(traversal, authenticatedRequest(http.MethodGet, "/../../etc/passwd", nil))
	// The router redirects to the cleaned path instead of reading outside the assets.
	if traversal.Code != http.StatusTemporaryRedirect || traversal.Header().Get("Location") != "/etc/passwd" {
		t.Fatalf("traversal = %d %q, want a redirect to the cleaned path", traversal.Code, traversal.Header().Get("Location"))
	}
}

func TestNewRequiresCatalogStore(t *testing.T) {
	t.Parallel()
	_, err := newHTTPServer(httpOptions{})
	if err == nil || !strings.Contains(err.Error(), "catalog store") {
		t.Fatalf("newHTTPServer() error = %v, want missing catalog dependency", err)
	}
}

func TestServerDoesNotExposeInternalFailureDetails(t *testing.T) {
	t.Parallel()
	server := newTestServer(t, nil)
	server.resolver = nil
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, authenticatedRequest(http.MethodGet, "/go/one", nil))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("navigation unavailable status = %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "internal") || strings.Contains(recorder.Body.String(), "/Users/") {
		t.Fatalf("failure page leaks internal details: %q", recorder.Body.String())
	}

	// Exercise the JSON error path too; it should remain a short user-facing message.
	unknown := httptest.NewRecorder()
	server.ServeHTTP(unknown, authenticatedRequest(http.MethodGet, "/api/nope?token=secret", nil))
	contents, err := io.ReadAll(unknown.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(contents), "secret") {
		t.Fatalf("API error leaks query parameters: %q", contents)
	}
}
