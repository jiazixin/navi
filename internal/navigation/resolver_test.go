package navigation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"navi/internal/catalog"
)

func TestResolverPrefersPrivateAndFallsBackToPublic(t *testing.T) {
	t.Parallel()

	public := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer public.Close()
	private := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer private.Close()
	resolver := NewResolver(NewProber(2), time.Second, time.Second, time.Minute)

	target, err := resolver.Resolve(context.Background(), catalog.Link{PrivateURL: private.URL, PublicURL: public.URL})
	if err != nil || target != private.URL {
		t.Fatalf("Resolve() = %q, %v", target, err)
	}

	target, err = resolver.Resolve(context.Background(), catalog.Link{PrivateURL: "http://127.0.0.1:1", PublicURL: public.URL})
	if err != nil || target != public.URL {
		t.Fatalf("Resolve() fallback = %q, %v", target, err)
	}
}
