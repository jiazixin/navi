package navigation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

type probeTransportFunc func(*http.Request) (*http.Response, error)

func (f probeTransportFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestProbeWaiterRetriesCanceledLeader(t *testing.T) {
	// Keep this test sequential while replacing the process-wide HTTP transport.
	original := http.DefaultTransport
	defer func() { http.DefaultTransport = original }()
	synctest.Test(t, func(t *testing.T) {
		var requests atomic.Int32
		http.DefaultTransport = probeTransportFunc(func(request *http.Request) (*http.Response, error) {
			if requests.Add(1) == 1 {
				<-request.Context().Done()
				return nil, request.Context().Err()
			}
			return &http.Response{StatusCode: http.StatusNoContent, Body: http.NoBody, Header: make(http.Header)}, nil
		})
		p := NewProber(1)
		leaderContext, cancel := context.WithCancel(t.Context())
		defer cancel()
		leader := make(chan bool, 1)
		waiter := make(chan bool, 1)
		go func() { leader <- p.Probe(leaderContext, "http://target.test", time.Second, time.Minute) }()
		synctest.Wait()
		go func() { waiter <- p.Probe(t.Context(), "http://target.test", time.Second, time.Minute) }()
		synctest.Wait()
		cancel()
		synctest.Wait()
		if <-leader {
			t.Fatal("canceled leader succeeded")
		}
		if !<-waiter {
			t.Fatal("waiter inherited another caller's cancellation")
		}
		if requests.Load() != 2 {
			t.Fatalf("requests = %d, want canceled request and successful retry", requests.Load())
		}
		if !p.Probe(t.Context(), "http://target.test", time.Second, time.Minute) || requests.Load() != 2 {
			t.Fatal("successful retry was not cached")
		}
	})
}

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
	if !prober.Probe(t.Context(), server.URL, time.Second, time.Minute) {
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
			results <- prober.Probe(t.Context(), server.URL, time.Second, time.Minute)
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

func TestProbeQueueUsesTimeoutAndDoesNotCacheCancellation(t *testing.T) {
	p := NewProber(1)
	p.limit <- struct{}{}
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	started := time.Now()
	if p.Probe(ctx, "http://example.test", 20*time.Millisecond, time.Minute) {
		t.Fatal("queued probe succeeded")
	}
	if time.Since(started) > 500*time.Millisecond {
		t.Fatal("queue ignored probe timeout")
	}
	<-p.limit
	if len(p.cache) != 0 {
		t.Fatal("cancellation poisoned cache")
	}
}

func TestProbeAllowsThreeRedirects(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			http.Redirect(w, r, "/one", http.StatusFound)
		case "/one":
			http.Redirect(w, r, "/two", http.StatusFound)
		case "/two":
			http.Redirect(w, r, "/done", http.StatusFound)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer server.Close()
	if !NewProber(1).Probe(t.Context(), server.URL, time.Second, time.Minute) {
		t.Fatal("three redirects rejected")
	}
	if limitRedirects(nil, make([]*http.Request, 4)) == nil {
		t.Fatal("four redirects accepted")
	}
}

func TestProberTreatsUntrustedCertificateAsReachable(t *testing.T) {
	t.Parallel()
	// Private services commonly use self-signed or internal-CA certificates that
	// the user's browser trusts but the Navi host does not.
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	if !NewProber(1).Probe(t.Context(), server.URL, time.Second, time.Minute) {
		t.Fatal("certificate verification failure reported the host as unreachable")
	}
}
