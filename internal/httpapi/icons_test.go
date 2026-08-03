package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"navi/internal/favicon"
)

func TestServerServesCachedIconWithETag(t *testing.T) {
	t.Parallel()
	store, err := favicon.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	entry, err := store.Put("one", "https://example.test/favicon.png", "image/png", "", []byte("\x89PNG\r\n\x1a\nimage"))
	if err != nil {
		t.Fatal(err)
	}
	server := newTestServer(t, nil)
	server.icons = store

	first := httptest.NewRecorder()
	server.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/icons/one", nil))
	if first.Code != http.StatusOK || first.Header().Get("ETag") != entry.ETag || first.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("icon response = %d, headers = %#v", first.Code, first.Header())
	}
	second := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/icons/one", nil)
	request.Header.Set("If-None-Match", entry.ETag)
	server.ServeHTTP(second, request)
	if second.Code != http.StatusNotModified {
		t.Fatalf("conditional icon response = %d", second.Code)
	}
}
