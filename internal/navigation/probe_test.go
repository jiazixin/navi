package navigation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestProberTreatsFourXXAsReachableAndFallsBackFromHead(t *testing.T) {
	t.Parallel()

	var gets atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodHead {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		gets.Add(1)
		if request.Header.Get("Range") != "bytes=0-0" {
			t.Error("GET fallback omitted Range header")
		}
		writer.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	prober := NewProber(2)
	if !prober.Probe(context.Background(), server.URL, time.Second, time.Minute) {
		t.Fatal("Probe() = false, want reachable")
	}
	if gets.Load() != 1 {
		t.Fatalf("GET requests = %d, want 1", gets.Load())
	}
}

func TestProberCachesAndCombinesConcurrentRequests(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		time.Sleep(20 * time.Millisecond)
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	prober := NewProber(1)
	const callers = 20
	results := make(chan bool, callers)
	for range callers {
		go func() {
			results <- prober.Probe(context.Background(), server.URL, time.Second, time.Minute)
		}()
	}
	for range callers {
		if !<-results {
			t.Fatal("Probe() = false, want reachable")
		}
	}
	if requests.Load() != 1 {
		t.Fatalf("requests = %d, want one shared HEAD request", requests.Load())
	}
}
