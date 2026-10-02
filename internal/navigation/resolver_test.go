package navigation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
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

	target, err := resolver.Resolve(t.Context(), catalog.Link{PrivateURL: private.URL, PublicURL: public.URL})
	if err != nil || target != private.URL {
		t.Fatalf("Resolve() = %q, %v", target, err)
	}

	target, err = resolver.Resolve(t.Context(), catalog.Link{PrivateURL: "http://127.0.0.1:1", PublicURL: public.URL})
	if err != nil || target != public.URL {
		t.Fatalf("Resolve() fallback = %q, %v", target, err)
	}
}

func TestUserRetryDiscardsNegativeCache(t *testing.T) {
	var ready atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	resolver := NewResolver(NewProber(1), time.Second, time.Second, time.Hour)
	link := catalog.Link{PublicURL: server.URL}
	if _, err := resolver.Resolve(t.Context(), link); err == nil {
		t.Fatal("expected unreachable")
	}
	ready.Store(true)
	if _, err := resolver.Resolve(t.Context(), link); err == nil {
		t.Fatal("negative cache not populated")
	}
	if target, err := resolver.Retry(t.Context(), link); err != nil || target != server.URL {
		t.Fatalf("retry = %q, %v", target, err)
	}
}

func TestResolverPreservesCallerCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	resolver := NewResolver(NewProber(1), time.Second, time.Second, time.Hour)
	_, err := resolver.Resolve(ctx, catalog.Link{PublicURL: "http://example.test"})
	if !errors.Is(err, context.Canceled) || errors.Is(err, ErrUnreachable) {
		t.Fatalf("canceled Resolve = %v", err)
	}
}
