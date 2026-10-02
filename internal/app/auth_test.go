package app

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"navi/internal/config"
)

func authServer(t *testing.T) *httpServer {
	server := newTestServer(t, nil)
	server.config.Auth = config.AuthConfig{Username: "tester", Password: "correct-password"}
	return server
}

func loginRequest(server *httpServer, password string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"tester","password":"`+password+`"}`))
	request.Header.Set("X-Navi-Request", "1")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	return response
}

func TestAuthenticationBoundary(t *testing.T) {
	server := authServer(t)
	for _, path := range []string{"/", "/index.html", "/client-route", "/go/one", "/api/catalog", "/api/status", "/api/events", "/api/icons/one"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		expectedStatus := http.StatusFound
		if strings.HasPrefix(path, "/api/") {
			expectedStatus = http.StatusUnauthorized
		}
		if response.Code != expectedStatus {
			t.Errorf("%s: %d, want %d", path, response.Code, expectedStatus)
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("%s is cacheable", path)
		}
	}
	for _, path := range []string{"/login", "/health"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Errorf("public %s: %d", path, response.Code)
		}
	}
}

func TestLoginLogoutAndExpiry(t *testing.T) {
	server := authServer(t)
	if response := loginRequest(server, "wrong"); response.Code != http.StatusUnauthorized || len(response.Result().Cookies()) != 0 {
		t.Fatal("invalid login accepted")
	}
	response := loginRequest(server, "correct-password")
	if response.Code != http.StatusOK {
		t.Fatalf("login: %d", response.Code)
	}
	cookie := response.Result().Cookies()[0]
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge != int(sessionLifetime.Seconds()) || len(cookie.Value) < 40 {
		t.Fatal("insecure cookie")
	}
	assertCatalogStatus := func(expectedStatus int) {
		t.Helper()
		request := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
		request.AddCookie(cookie)
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != expectedStatus {
			t.Fatalf("catalog: %d, want %d", response.Code, expectedStatus)
		}
	}
	assertCatalogStatus(http.StatusOK)
	request := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	request.AddCookie(cookie)
	request.Header.Set("X-Navi-Request", "1")
	response = httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || response.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("logout failed")
	}
	assertCatalogStatus(http.StatusUnauthorized)
	cookie = loginRequest(server, "correct-password").Result().Cookies()[0]
	server.auth.sessions[cookie.Value] = time.Now().Add(-time.Second)
	assertCatalogStatus(http.StatusUnauthorized)
	server.config.Auth.SecureCookie = true
	if !loginRequest(server, "correct-password").Result().Cookies()[0].Secure {
		t.Fatal("secure cookie ignored")
	}
}

func TestLoginCSRFMethodsAndThrottle(t *testing.T) {
	server := authServer(t)
	for _, endpoint := range []string{"login", "logout"} {
		for _, origin := range []string{"", "https://attacker.example", "null"} {
			request := httptest.NewRequest(http.MethodPost, "/api/auth/"+endpoint, nil)
			if origin != "" {
				request.Header.Set("X-Navi-Request", "1")
				request.Header.Set("Origin", origin)
			}
			response := httptest.NewRecorder()
			server.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("CSRF accepted: %s %s %d", endpoint, origin, response.Code)
			}
		}
		request := httptest.NewRequest(http.MethodGet, "/api/auth/"+endpoint, nil)
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatal("GET mutation accepted")
		}
	}
	for range 5 {
		if loginRequest(server, "wrong").Code != http.StatusUnauthorized {
			t.Fatal("throttled too early")
		}
	}
	if loginRequest(server, "correct-password").Code != http.StatusTooManyRequests {
		t.Fatal("missing throttle")
	}
}

func TestEmptyCredentialsAllowPublicAccess(t *testing.T) {
	server := authServer(t)
	server.config.Auth = config.AuthConfig{}
	for _, path := range []string{"/", "/api/catalog", "/api/status", "/api/auth/session"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Errorf("%s: %d", path, response.Code)
		}
		if len(response.Result().Cookies()) != 0 {
			t.Errorf("public access set cookie")
		}
		if path == "/api/auth/session" && !strings.Contains(response.Body.String(), `"authRequired":false`) {
			t.Fatal("missing public mode")
		}
	}
	for _, path := range []string{"/api/icons/unknown", "/go/unknown"} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code == http.StatusUnauthorized || response.Code == http.StatusFound {
			t.Errorf("public route required login: %s", path)
		}
	}
}

func TestLoginRejectsMalformedCredentials(t *testing.T) {
	for _, body := range []string{
		`{"username":"tester","password":"correct-password","extra":true}`,
		`{"username":"tester","password":"correct-password"} {}`,
		`{"username":"tester","password":`,
		`{"username":"tester","password":"` + strings.Repeat("x", maxLoginRequestBytes) + `"}`,
	} {
		server := authServer(t)
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
		request.Header.Set("X-Navi-Request", "1")
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest || len(response.Result().Cookies()) != 0 {
			t.Fatalf("invalid credentials: status=%d, cookies=%v", response.Code, response.Result().Cookies())
		}
	}
}

func TestLoginThrottleExpiresAndSuccessResetsAttempts(t *testing.T) {
	server := authServer(t)
	for range maxLoginAttempts {
		loginRequest(server, "wrong")
	}
	// Advance the stored window rather than sleeping for a minute.
	for clientIP, attempt := range server.auth.attempts {
		attempt.resetAt = time.Now().Add(-time.Second)
		server.auth.attempts[clientIP] = attempt
	}
	if response := loginRequest(server, "correct-password"); response.Code != http.StatusOK {
		t.Fatalf("expired throttle blocked login: %d", response.Code)
	}
	for range maxLoginAttempts {
		if response := loginRequest(server, "wrong"); response.Code != http.StatusUnauthorized {
			t.Fatalf("successful login did not reset attempts: %d", response.Code)
		}
	}
}

func TestLoginReplacesPreviousSession(t *testing.T) {
	server := authServer(t)
	previousCookie := loginRequest(server, "correct-password").Result().Cookies()[0]
	sessionCountBefore := len(server.auth.sessions)
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"tester","password":"correct-password"}`))
	request.Header.Set("X-Navi-Request", "1")
	request.AddCookie(previousCookie)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("second login: %d", response.Code)
	}
	if _, exists := server.auth.sessions[previousCookie.Value]; exists {
		t.Fatal("previous session remained valid")
	}
	if len(server.auth.sessions) != sessionCountBefore || response.Result().Cookies()[0].Value == previousCookie.Value {
		t.Fatal("session was not replaced with a fresh token")
	}
}

func TestLoginReplacesSessionAtCapacity(t *testing.T) {
	server := authServer(t)
	clear(server.auth.sessions)
	for i := range maxActiveSessions {
		server.auth.sessions[fmt.Sprintf("session-%d", i)] = time.Now().Add(time.Hour)
	}
	if response := loginRequest(server, "correct-password"); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("new session at capacity = %d, want 503", response.Code)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"tester","password":"correct-password"}`))
	request.Header.Set("X-Navi-Request", "1")
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: "session-0"})
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK || len(server.auth.sessions) != maxActiveSessions {
		t.Fatalf("replacement at capacity = %d, sessions=%d", response.Code, len(server.auth.sessions))
	}
	if _, exists := server.auth.sessions["session-0"]; exists {
		t.Fatal("old session survived replacement")
	}
	check := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	check.AddCookie(response.Result().Cookies()[0])
	if !server.authenticated(check) {
		t.Fatal("replacement session is not usable")
	}
}

func TestAuthOriginValidation(t *testing.T) {
	for _, testCase := range []struct {
		origin  string
		allowed bool
	}{
		{"", true},
		{"https://example.com", true},
		{"http://example.com", true},
		{"https://attacker.example", false},
		{"https://user@example.com", false},
		{"https://example.com/path", false},
		{"https://example.com?query=value", false},
		{"https://example.com#fragment", false},
		{"null", false},
	} {
		t.Run(testCase.origin, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "https://example.com/api/auth/logout", nil)
			request.Header.Set("X-Navi-Request", "1")
			request.Header.Set("Origin", testCase.origin)
			if allowed := isAllowedAuthOrigin(request); allowed != testCase.allowed {
				t.Fatalf("origin allowed = %v, want %v", allowed, testCase.allowed)
			}
			request.Header.Set("Sec-Fetch-Site", "cross-site")
			if isAllowedAuthOrigin(request) {
				t.Fatal("cross-site request accepted")
			}
		})
	}
}
