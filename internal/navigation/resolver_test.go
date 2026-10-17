package navigation

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"navi/internal/catalog"
)

func TestResolverPrefersPrivateAndFallsBackToPublicWithoutProbingIt(t *testing.T) {
	t.Parallel()

	var publicRequests atomic.Int32
	public := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		publicRequests.Add(1)
	}))
	defer public.Close()
	private := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer private.Close()
	resolver := NewResolver(NewProber(2), time.Second, time.Minute)

	if target := resolver.Resolve(t.Context(), catalog.Link{PrivateURL: private.URL, PublicURL: public.URL}); target != private.URL {
		t.Fatalf("Resolve() = %q", target)
	}
	if target := resolver.Resolve(t.Context(), catalog.Link{PrivateURL: "http://127.0.0.1:1", PublicURL: public.URL}); target != public.URL {
		t.Fatalf("Resolve() fallback = %q", target)
	}
	if publicRequests.Load() != 0 {
		t.Fatalf("public requests = %d, want 0", publicRequests.Load())
	}
}

func TestResolverReturnsSingleDestinationWithoutProbing(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		writer.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	resolver := NewResolver(NewProber(1), time.Second, time.Minute)

	for _, link := range []catalog.Link{{PrivateURL: server.URL}, {PublicURL: server.URL}} {
		if target := resolver.Resolve(t.Context(), link); target != server.URL {
			t.Fatalf("Resolve(%+v) = %q", link, target)
		}
	}
	if requests.Load() != 0 {
		t.Fatalf("requests = %d, want 0", requests.Load())
	}
}
