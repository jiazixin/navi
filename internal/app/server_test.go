package app

import (
	"bytes"
	"encoding/json/v2"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
	"navi/internal/navigation"
)

func TestServerCatalogETagStatusAndReadOnlyMethods(t *testing.T) {
	t.Parallel()
	server := newTestServer(t, nil)

	first := httptest.NewRecorder()
	server.ServeHTTP(first, authenticatedRequest(http.MethodGet, "/api/catalog", nil))
	if first.Code != http.StatusOK || first.Header().Get("ETag") == "" {
		t.Fatalf("catalog response = %d, headers = %#v", first.Code, first.Header())
	}
	second := httptest.NewRecorder()
	request := authenticatedRequest(http.MethodGet, "/api/catalog", nil)
	request.Header.Set("If-None-Match", first.Header().Get("ETag"))
	server.ServeHTTP(second, request)
	if second.Code != http.StatusNotModified {
		t.Fatalf("conditional response = %d, want 304", second.Code)
	}

	status := httptest.NewRecorder()
	server.ServeHTTP(status, authenticatedRequest(http.MethodGet, "/api/status", nil))
	if status.Code != http.StatusOK {
		t.Fatalf("status response = %d", status.Code)
	}

	method := httptest.NewRecorder()
	server.ServeHTTP(method, authenticatedRequest(http.MethodPost, "/api/catalog", nil))
	if method.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST response = %d, want 405", method.Code)
	}
}

func TestServerSecurityHeadersAcrossPublicAndProtectedRoutes(t *testing.T) {
	server := newTestServer(t, nil)
	for _, route := range []string{"/login", "/healthz", "/api/catalog", "/api/icons/missing", "/go/missing"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, authenticatedRequest(http.MethodGet, route, nil))
		if response.Header().Get("X-Content-Type-Options") != "nosniff" || response.Header().Get("X-Frame-Options") != "DENY" {
			t.Errorf("%s: security headers = %v", route, response.Header())
		}
	}
}

func TestServerAccessLogCapturesRequestAndSuppressesHealthChecks(t *testing.T) {
	t.Parallel()
	var output bytes.Buffer
	server := newTestServer(t, nil)
	server.config.Logging.AccessLog = true
	server.config.Logging.LogHealthChecks = false
	server.logger = slog.New(slog.NewJSONHandler(&output, nil))

	request := authenticatedRequest(http.MethodGet, "/api/catalog?token=secret", nil)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("catalog response = %d", response.Code)
	}
	var record map[string]any
	if err := json.Unmarshal(output.Bytes(), &record); err != nil {
		t.Fatalf("decode access log: %v; output=%q", err, output.String())
	}
	if record["request_id"] != response.Header().Get("X-Request-ID") {
		t.Fatalf("request_id = %#v, header = %q", record["request_id"], response.Header().Get("X-Request-ID"))
	}
	if record["method"] != http.MethodGet || record["path"] != "/api/catalog" || record["status"] != float64(http.StatusOK) {
		t.Fatalf("access record = %#v", record)
	}
	if record["bytes"] != float64(response.Body.Len()) {
		t.Fatalf("bytes = %#v, body length = %d", record["bytes"], response.Body.Len())
	}
	if bytes.Contains(output.Bytes(), []byte("secret")) {
		t.Fatalf("access log leaked query string: %q", output.String())
	}

	output.Reset()
	health := httptest.NewRecorder()
	server.ServeHTTP(health, authenticatedRequest(http.MethodGet, "/healthz", nil))
	if output.Len() != 0 {
		t.Fatalf("health access log = %q, want suppressed", output.String())
	}

	server.config.Logging.LogHealthChecks = true
	health = httptest.NewRecorder()
	server.ServeHTTP(health, authenticatedRequest(http.MethodGet, "/healthz", nil))
	if output.Len() == 0 {
		t.Fatal("health access log missing when enabled")
	}
}

func TestServerRedirectsAndRejectsUnknownPages(t *testing.T) {
	t.Parallel()
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("single destination was probed: %s %s", r.Method, r.URL)
	}))
	defer target.Close()
	server := newTestServer(t, nil)
	server.resolver = navigation.NewResolver(navigation.NewProber(1), time.Second, time.Minute)
	server.catalog.Publish(catalog.Catalog{Pages: []catalog.Page{{ID: "page1", Title: "Navi", Groups: []catalog.Group{{Name: "One", Links: []catalog.Link{{RuntimeID: "one", Name: "One", PublicURL: target.URL}}}}}}})

	redirect := httptest.NewRecorder()
	server.ServeHTTP(redirect, authenticatedRequest(http.MethodGet, "/go/one", nil))
	if redirect.Code != http.StatusFound || redirect.Header().Get("Location") != target.URL {
		t.Fatalf("redirect = %d %q", redirect.Code, redirect.Header().Get("Location"))
	}

	for _, path := range []string{"/client-route", "/navigation", "/index.html"} {
		page := httptest.NewRecorder()
		server.ServeHTTP(page, authenticatedRequest(http.MethodGet, path, nil))
		if page.Code != http.StatusNotFound || !strings.Contains(page.Body.String(), `<div id="root"`) {
			t.Fatalf("page %s = %d %q, want a not-found application shell", path, page.Code, page.Body.String())
		}
	}
}

func TestNavigationProbesDocumentAndPreservesAnchorInRedirect(t *testing.T) {
	var probed atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/docs" || r.URL.Fragment != "" {
			t.Errorf("probe requested anchor as path data: %s", r.URL)
		}
		probed.Store(true)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer target.Close()
	destination := target.URL + "/docs#section"
	directory, err := catalog.LoadFile(t.Context(), writeEventCatalog(t, fmt.Sprintf("version: 1\npages:\n  - id: page1\n    title: Navi\n    urls:\n      - {name: Docs, group: One, private_url: %q, public_url: https://public.example}\n", destination)))
	if err != nil {
		t.Fatal(err)
	}
	server := newTestServer(t, navigation.NewResolver(navigation.NewProber(1), time.Second, time.Minute))
	server.catalog.Publish(directory)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, authenticatedRequest(http.MethodGet, "/go/"+directory.Pages[0].Groups[0].Links[0].RuntimeID, nil))
	if response.Code != http.StatusFound || response.Header().Get("Location") != destination {
		t.Fatalf("anchor redirect = %d %q", response.Code, response.Header().Get("Location"))
	}
	if !probed.Load() {
		t.Fatal("private destination was not probed")
	}
}

func newTestServer(t *testing.T, resolver *navigation.Resolver) *httpServer {
	t.Helper()
	store := catalog.NewStore()
	store.Publish(catalog.Catalog{
		Pages: []catalog.Page{{
			ID: "page1", Title: "Navi",
			Groups: []catalog.Group{{
				Name:  "One",
				Links: []catalog.Link{{RuntimeID: "one", Name: "One", Tags: []string{}}},
			}},
		}},
	})
	static := fs.FS(fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(`<html><title>Navi</title><div id="root"></div></html>`)}})
	server, err := newHTTPServer(httpOptions{
		Config:  config.Config{Auth: config.AuthConfig{Username: "tester", PasswordHash: "$2a$10$MH76nh/43WkSzvdsv9cze.Jmxo2eu6fQkcVtBgMvT2IAXwdLje7Gu"}, Theme: "default", BackgroundPattern: "contour", WebSearch: "baidu"},
		Catalog: store, Resolver: resolver, Static: static,
	})
	if err != nil {
		t.Fatal(err)
	}
	server.auth.sessions[sessionDigest("test-session")] = time.Now().Add(time.Hour)
	return server
}

func TestNavigationFailureUsesProductionShellAndEscapesContent(t *testing.T) {
	server := newTestServer(t, nil)
	server.static = fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(`<html><div id="root"></div><script src="/assets/app.js"></script></html>`)}}
	request := authenticatedRequest(http.MethodGet, "/go/one?token=secret", nil)
	response := httptest.NewRecorder()
	server.writeFailurePage(response, request, failurePage{Status: http.StatusBadGateway, Code: `<script>alert("x")</script>`})
	body := response.Body.String()
	if response.Code != http.StatusBadGateway || !strings.Contains(body, `data-navigation-error="&lt;script&gt;`) || !strings.Contains(body, `data-retry-path="/go/one"`) || !strings.Contains(body, `/assets/app.js`) || !strings.Contains(body, `data-configured-pattern="contour"`) {
		t.Fatalf("failure response = %d %s", response.Code, body)
	}
	if strings.Contains(body, "secret") || strings.Contains(body, `<script>alert`) {
		t.Fatal("failure content not escaped")
	}
	head := httptest.NewRecorder()
	server.ServeHTTP(head, authenticatedRequest(http.MethodHead, "/go/one", nil))
	if head.Body.Len() != 0 {
		t.Fatal("HEAD failure returned body")
	}
}

func TestNavigationFailureTextBelongsToTheClient(t *testing.T) {
	t.Parallel()
	server := newTestServer(t, nil)
	server.static = fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(`<html><div id="root"></div><script src="/assets/app.js"></script></html>`)}}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, authenticatedRequest(http.MethodGet, "/go/missing", nil))
	body := response.Body.String()
	if !strings.Contains(body, `data-navigation-error="link_unavailable"`) || !strings.Contains(body, `data-retry-path="/go/missing"`) {
		t.Fatalf("client navigation metadata missing: %q", body)
	}
	if strings.Contains(body, "<main>") || strings.Contains(body, "<h1>") || strings.Contains(body, "重试访问") {
		t.Fatalf("server rendered navigation text: %q", body)
	}
}

func TestNavigationFailureRequiresTheBuiltClient(t *testing.T) {
	t.Parallel()
	for name, static := range map[string]fs.FS{
		"missing filesystem": nil,
		"missing index":      fstest.MapFS{},
		"missing root":       fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("<html></html>")}},
	} {
		t.Run(name, func(t *testing.T) {
			server := newTestServer(t, nil)
			server.static = static
			response := httptest.NewRecorder()
			server.ServeHTTP(response, authenticatedRequest(http.MethodGet, "/go/missing", nil))
			var failure apiError
			if err := json.Unmarshal(response.Body.Bytes(), &failure); err != nil {
				t.Fatalf("decode missing-client error: %v; body=%q", err, response.Body)
			}
			if response.Code != http.StatusServiceUnavailable || failure.Error.Code != "frontend_not_built" {
				t.Fatalf("response = %d %s", response.Code, response.Body)
			}
		})
	}
}

func TestStaticRoutesRejectMissingAssetsAndInjectAppearance(t *testing.T) {
	server := newTestServer(t, nil)
	server.config.Theme = "celadon"
	server.config.BackgroundPattern = "ridge"
	server.config.WebSearch = "bing"
	server.static = fstest.MapFS{
		"index.html":    &fstest.MapFile{Data: []byte(`<html><div id="root"></div></html>`)},
		"assets/app.js": &fstest.MapFile{Data: []byte(`console.log("Navi")`)},
	}
	server.files = http.FileServer(http.FS(server.static))
	for _, route := range []string{"/assets", "/assets/", "/assets/missing.js"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, authenticatedRequest(http.MethodGet, route, nil))
		if response.Code != http.StatusNotFound {
			t.Errorf("%s returned %d, want 404", route, response.Code)
		}
	}
	for _, route := range []string{"/", "/login"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, authenticatedRequest(http.MethodGet, route, nil))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `data-configured-theme="celadon" data-configured-pattern="ridge" data-configured-search="bing"`) {
			t.Errorf("%s did not serve the configured shell: %d %s", route, response.Code, response.Body)
		}
	}
	asset := httptest.NewRecorder()
	server.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if asset.Code != http.StatusOK || asset.Body.String() != `console.log("Navi")` {
		t.Fatalf("asset = %d %s", asset.Code, asset.Body)
	}
}

// Existing route tests start with an explicitly seeded authenticated session.
func authenticatedRequest(method, target string, body io.Reader) *http.Request {
	r := httptest.NewRequest(method, target, body)
	r.AddCookie(&http.Cookie{Name: sessionCookie, Value: "test-session"})
	return r
}
