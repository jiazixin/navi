package favicon

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDiscoveryBoundsUniqueDeclarationsAndRetainsRootFallback(t *testing.T) {
	var contents strings.Builder
	// Duplicate and empty declarations must not consume the candidate budget.
	contents.WriteString(`<link rel="icon" href="">`)
	for range 20 {
		contents.WriteString(`<link rel="icon" sizes="64x64" href="/best.png">`)
	}
	for index := range maxDeclaredCandidates + 10 {
		fmt.Fprintf(&contents, `<link rel="icon" href="/icon-%d.png">`, index)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(contents.String()))
	}))
	defer server.Close()
	urls, err := Discover(t.Context(), server.Client(), server.URL+"/page")
	if err != nil {
		t.Fatal(err)
	}
	if len(urls) != maxDeclaredCandidates+1 || urls[0] != server.URL+"/best.png" || urls[len(urls)-1] != server.URL+"/favicon.ico" {
		t.Fatalf("bounded candidates = %v", urls)
	}
}

func TestDiscoverPrioritizesDeclaredRelativeIconAndFallsBackToOrigin(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><link rel="apple-touch-icon" sizes="64x64" href="/icons/apple.png"><link rel="icon" sizes="16x16" href="tiny.png"></head></html>`))
	}))
	defer server.Close()

	urls, err := Discover(t.Context(), server.Client(), server.URL+"/page")
	if err != nil {
		t.Fatal(err)
	}
	if len(urls) != 3 || urls[0] != server.URL+"/icons/apple.png" || urls[2] != server.URL+"/favicon.ico" {
		t.Fatalf("urls = %v", urls)
	}
}

func TestDiscoveryFailuresStillProvideRootIcon(t *testing.T) {
	for _, mode := range []string{"protected", "oversized", "timeout"} {
		t.Run(mode, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch mode {
				case "protected":
					w.WriteHeader(http.StatusForbidden)
				case "oversized":
					_, _ = w.Write(make([]byte, maxHTMLBytes+1))
				case "timeout":
					<-r.Context().Done()
				}
			}))
			defer server.Close()
			client := server.Client()
			client.Timeout = 100 * time.Millisecond
			urls, err := Discover(t.Context(), client, server.URL+"/protected")
			if err != nil || len(urls) != 1 || urls[0] != server.URL+"/favicon.ico" {
				t.Fatalf("fallback = %v, %v", urls, err)
			}
		})
	}
}

func TestDiscoveryCancellationDoesNotContinueToFallback(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := Discover(ctx, (&http.Client{Timeout: 5 * time.Second}), "http://127.0.0.1:1/"); err == nil {
		t.Fatal("cancellation ignored")
	}
}
