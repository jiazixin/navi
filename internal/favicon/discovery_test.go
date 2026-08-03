package favicon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDiscoverPrioritizesDeclaredRelativeIconAndFallsBackToOrigin(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/html")
		_, _ = writer.Write([]byte(`<html><head><link rel="apple-touch-icon" sizes="64x64" href="/icons/apple.png"><link rel="icon" sizes="16x16" href="tiny.png"></head></html>`))
	}))
	defer server.Close()

	urls, err := Discover(context.Background(), server.Client(), server.URL+"/page")
	if err != nil {
		t.Fatal(err)
	}
	if len(urls) != 3 || urls[0] != server.URL+"/icons/apple.png" || urls[2] != server.URL+"/favicon.ico" {
		t.Fatalf("urls = %v", urls)
	}
}
