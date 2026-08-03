package httpapi

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
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
	server.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/catalog", nil))
	if first.Code != http.StatusOK || first.Header().Get("ETag") == "" {
		t.Fatalf("catalog response = %d, headers = %#v", first.Code, first.Header())
	}
	second := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
	request.Header.Set("If-None-Match", first.Header().Get("ETag"))
	server.ServeHTTP(second, request)
	if second.Code != http.StatusNotModified {
		t.Fatalf("conditional response = %d, want 304", second.Code)
	}

	status := httptest.NewRecorder()
	server.ServeHTTP(status, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if status.Code != http.StatusOK {
		t.Fatalf("status response = %d", status.Code)
	}

	method := httptest.NewRecorder()
	server.ServeHTTP(method, httptest.NewRequest(http.MethodPost, "/api/catalog", nil))
	if method.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST response = %d, want 405", method.Code)
	}
}

func TestServerRedirectsAndProvidesSPAStaticFallback(t *testing.T) {
	t.Parallel()
	target := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer target.Close()
	server := newTestServer(t, nil)
	server.resolver = navigation.NewResolver(navigation.NewProber(1), time.Second, time.Second, time.Minute)
	server.catalog.Publish(catalog.Catalog{Pages: []catalog.Page{{ID: "page1", Title: "Navi", Groups: []catalog.Group{{Name: "One", Links: []catalog.Link{{RuntimeID: "one", Name: "One", PublicURL: target.URL}}}}}}})

	redirect := httptest.NewRecorder()
	server.ServeHTTP(redirect, httptest.NewRequest(http.MethodGet, "/go/one", nil))
	if redirect.Code != http.StatusFound || redirect.Header().Get("Location") != target.URL {
		t.Fatalf("redirect = %d %q", redirect.Code, redirect.Header().Get("Location"))
	}

	page := httptest.NewRecorder()
	server.ServeHTTP(page, httptest.NewRequest(http.MethodGet, "/client-route", nil))
	if page.Code != http.StatusOK || page.Body.String() != "<main>Navi</main>" {
		t.Fatalf("static fallback = %d %q", page.Code, page.Body.String())
	}
}

func newTestServer(t *testing.T, resolver *navigation.Resolver) *Server {
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
	static := fs.FS(fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("<main>Navi</main>")}})
	server, err := New(Options{
		Config:  config.Config{Theme: "default", BackgroundPattern: "meridian-grid", WebSearch: "baidu", Health: config.HealthConfig{URI: "/health"}},
		Catalog: store, Resolver: resolver, Static: static,
	})
	if err != nil {
		t.Fatal(err)
	}
	return server
}
