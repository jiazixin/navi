package app

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func FuzzDecodeLogin(f *testing.F) {
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > maxLoginRequestBytes+1 {
			return
		}
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(data))
		request.Header.Set("Content-Type", "application/json")
		_, _ = decodeLogin(httptest.NewRecorder(), request) // Rejection is expected for malformed input.
	})
}
