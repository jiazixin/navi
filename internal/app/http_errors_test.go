package app

import (
	"bytes"
	"encoding/json/v2"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestJSONEncodingFailureUsesErrorEnvelopeBeforeHeaders(t *testing.T) {
	t.Parallel()
	var logs bytes.Buffer
	server := newTestServer(t, nil)
	server.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	server.mux.HandleFunc("GET /api/broken", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, r, jsonResponse{Status: http.StatusOK, Payload: make(chan int)})
	})
	response := httptest.NewRecorder()
	server.ServeHTTP(response, authenticatedRequest(http.MethodGet, "/api/broken", nil))
	var failure apiError
	if err := json.Unmarshal(response.Body.Bytes(), &failure); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusInternalServerError || failure.Error.Code != "internal" {
		t.Fatalf("got %d %q, want a complete internal error envelope", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "chan") || !strings.Contains(logs.String(), "request_failed") {
		t.Fatalf("got body %q and logs %q, want internal details only in logs", response.Body.String(), logs.String())
	}
	if !strings.Contains(logs.String(), response.Header().Get("X-Request-ID")) {
		t.Fatal("request failure log is missing the response request ID")
	}
}
