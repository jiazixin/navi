package app

import (
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"testing"

	"navi/internal/favicon"
)

func TestIconHTTPFailuresUseAPIEnvelope(t *testing.T) {
	t.Parallel()
	store, err := favicon.NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put(t.Context(), favicon.WriteRequest{RuntimeID: "one", SourceURL: "https://example.test/icon.png", ContentType: "image/png", Body: []byte("icon")}); err != nil {
		t.Fatal(err)
	}
	server := newTestServer(t, nil)
	server.icons = store
	for _, test := range []struct {
		name, header, value, code string
		status                    int
	}{
		{name: "invalid range", header: "Range", value: "bytes=invalid", status: http.StatusRequestedRangeNotSatisfiable, code: "invalid_argument"},
		{name: "outside range", header: "Range", value: "bytes=999-", status: http.StatusRequestedRangeNotSatisfiable, code: "invalid_argument"},
		{name: "unmatched etag", header: "If-Match", value: `"other"`, status: http.StatusPreconditionFailed, code: "precondition_failed"},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := authenticatedRequest(http.MethodGet, "/api/icons/one", nil)
			request.Header.Set(test.header, test.value)
			response := httptest.NewRecorder()
			server.ServeHTTP(response, request)
			var failure apiError
			if err := json.Unmarshal(response.Body.Bytes(), &failure); err != nil {
				t.Fatalf("decode error response: %v; body = %q", err, response.Body)
			}
			if response.Code != test.status || failure.Error.Code != test.code || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("response = %d, %s, %v", response.Code, response.Body, response.Header())
			}
		})
	}
}

func TestServerServesCachedIconWithETag(t *testing.T) {
	t.Parallel()
	store, err := favicon.NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	entry, err := store.Put(t.Context(), favicon.WriteRequest{RuntimeID: "one", SourceURL: "https://example.test/favicon.png", ContentType: "image/png", SourceETag: "", LastModified: "", Body: []byte("\x89PNG\r\n\x1a\nimage")})
	if err != nil {
		t.Fatal(err)
	}
	server := newTestServer(t, nil)
	server.icons = store

	first := httptest.NewRecorder()
	server.ServeHTTP(first, authenticatedRequest(http.MethodGet, "/api/icons/one", nil))
	if first.Code != http.StatusOK || first.Header().Get("ETag") != entry.ETag || first.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("icon response = %d, headers = %#v", first.Code, first.Header())
	}
	second := httptest.NewRecorder()
	request := authenticatedRequest(http.MethodGet, "/api/icons/one", nil)
	request.Header.Set("If-None-Match", entry.ETag)
	server.ServeHTTP(second, request)
	if second.Code != http.StatusNotModified || second.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("conditional icon response = %d", second.Code)
	}
}

func TestIconRefreshRevalidatesSameURL(t *testing.T) {
	store, err := favicon.NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	old, err := store.Put(t.Context(), favicon.WriteRequest{RuntimeID: "one", SourceURL: "https://example.test/icon.png", ContentType: "image/png", SourceETag: "", LastModified: "", Body: []byte("old")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put(t.Context(), favicon.WriteRequest{RuntimeID: "one", SourceURL: "https://example.test/icon.png", ContentType: "image/png", SourceETag: "", LastModified: "", Body: []byte("new")}); err != nil {
		t.Fatal(err)
	}
	server := newTestServer(t, nil)
	server.icons = store
	request := authenticatedRequest(http.MethodGet, "/api/icons/one", nil)
	request.Header.Set("If-None-Match", old.ETag)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Body.String() != "new" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("refresh = %d %s %v", response.Code, response.Body, response.Header())
	}
}

func TestPublicIconPreventsBrowserStorage(t *testing.T) {
	store, err := favicon.NewStore(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put(t.Context(), favicon.WriteRequest{RuntimeID: "one", SourceURL: "https://example.test/icon.png", ContentType: "image/png", SourceETag: "", LastModified: "", Body: []byte("icon")}); err != nil {
		t.Fatal(err)
	}
	server := newTestServer(t, nil)
	server.config.Auth.Username, server.config.Auth.PasswordHash = "", ""
	server.icons = store
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/icons/one", nil))
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("public icon response = %d, headers = %v", response.Code, response.Header())
	}
}
