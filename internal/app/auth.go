package app

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"maps"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	sessionCookie          = "navi_session"
	sessionLifetime        = 24 * time.Hour
	loginAttemptWindow     = time.Minute
	maxLoginAttempts       = 5
	maxTrackedLoginClients = 4096
	maxActiveSessions      = 4096
	maxLoginRequestBytes   = 8192
	sessionTokenBytes      = 32
)

type loginAttempt struct {
	count   int
	resetAt time.Time
}

type authState struct {
	mu       sync.Mutex
	sessions map[string]time.Time
	attempts map[string]loginAttempt
}

func newAuthState() *authState {
	return &authState{sessions: make(map[string]time.Time), attempts: make(map[string]loginAttempt)}
}

func (server *httpServer) authenticated(request *http.Request) bool {
	if !server.config.Auth.Enabled() {
		return true
	}
	cookie, err := request.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	server.auth.mu.Lock()
	defer server.auth.mu.Unlock()
	expiresAt, ok := server.auth.sessions[cookie.Value]
	if !ok {
		return false
	}
	if !time.Now().Before(expiresAt) {
		delete(server.auth.sessions, cookie.Value)
		return false
	}
	return true
}

func (server *httpServer) authorize(writer http.ResponseWriter, request *http.Request) bool {
	requestPath := request.URL.Path
	if requestPath == server.config.Health.URI || requestPath == "/login" || strings.HasPrefix(requestPath, "/assets/") {
		return true
	}
	writer.Header().Set("Cache-Control", "no-store")
	if server.authenticated(request) {
		return true
	}
	if requestPath == "/api" || strings.HasPrefix(requestPath, "/api/") {
		writeJSONError(writer, http.StatusUnauthorized, "请先登录。")
	} else {
		http.Redirect(writer, request, "/login", http.StatusFound)
	}
	return false
}

func (server *httpServer) serveAuth(writer http.ResponseWriter, request *http.Request) bool {
	requestPath := request.URL.Path
	if requestPath != "/api/auth/login" && requestPath != "/api/auth/logout" && requestPath != "/api/auth/session" {
		return false
	}
	writer.Header().Set("Cache-Control", "no-store")
	if requestPath == "/api/auth/session" {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			writer.Header().Set("Allow", "GET, HEAD")
			writeJSONError(writer, http.StatusMethodNotAllowed, "请求方法不支持。")
		} else if !server.authenticated(request) {
			writeJSONError(writer, http.StatusUnauthorized, "请先登录。")
		} else {
			writeJSON(writer, http.StatusOK, map[string]bool{"authenticated": true, "authRequired": server.config.Auth.Enabled()})
		}
		return true
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", "POST")
		writeJSONError(writer, http.StatusMethodNotAllowed, "请求方法不支持。")
		return true
	}
	// JSON plus a required custom header prevents cross-origin simple form requests.
	// Validate Origin when present; never trust forwarded host/protocol headers.
	if !isAllowedAuthOrigin(request) {
		writeJSONError(writer, http.StatusForbidden, "请求来源无效。")
		return true
	}
	if requestPath == "/api/auth/logout" {
		if cookie, err := request.Cookie(sessionCookie); err == nil {
			server.auth.mu.Lock()
			delete(server.auth.sessions, cookie.Value)
			server.auth.mu.Unlock()
		}
		server.setSessionCookie(writer, request, "", -1)
		writer.WriteHeader(http.StatusNoContent)
		return true
	}
	server.login(writer, request)
	return true
}

func isAllowedAuthOrigin(request *http.Request) bool {
	if request.Header.Get("X-Navi-Request") != "1" || request.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origin := request.Header.Get("Origin")
	if origin == "" {
		return true
	}
	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return originURL.Host == request.Host &&
		(originURL.Scheme == "http" || originURL.Scheme == "https") &&
		originURL.User == nil && originURL.RawQuery == "" &&
		originURL.Fragment == "" && originURL.Path == ""
}

func (server *httpServer) setSessionCookie(writer http.ResponseWriter, request *http.Request, token string, maxAge int) {
	http.SetCookie(writer, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   server.config.Auth.SecureCookie || request.TLS != nil,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
	})
}

type loginCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (server *httpServer) login(writer http.ResponseWriter, request *http.Request) {
	clientIP, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		clientIP = request.RemoteAddr
	}
	now := time.Now()
	if !server.auth.recordLoginAttempt(clientIP, now) {
		writer.Header().Set("Retry-After", strconv.Itoa(int(loginAttemptWindow.Seconds())))
		writeJSONError(writer, http.StatusTooManyRequests, "尝试次数过多，请一分钟后重试。")
		return
	}

	credentials, err := decodeLoginCredentials(http.MaxBytesReader(writer, request.Body, maxLoginRequestBytes))
	if err != nil {
		writeJSONError(writer, http.StatusBadRequest, "登录请求格式无效。")
		return
	}
	if !server.credentialsMatch(credentials) {
		writeJSONError(writer, http.StatusUnauthorized, "账号或密码不正确。")
		return
	}

	var tokenBytes [sessionTokenBytes]byte
	if _, err := rand.Read(tokenBytes[:]); err != nil {
		writeJSONError(writer, http.StatusInternalServerError, "暂时无法登录，请重试。")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes[:])
	previousToken := ""
	if cookie, err := request.Cookie(sessionCookie); err == nil {
		previousToken = cookie.Value
	}
	if !server.auth.createSession(clientIP, token, previousToken, now) {
		writeJSONError(writer, http.StatusServiceUnavailable, "会话已满，请稍后重试。")
		return
	}
	server.setSessionCookie(writer, request, token, int(sessionLifetime.Seconds()))
	writeJSON(writer, http.StatusOK, map[string]bool{"authenticated": true, "authRequired": server.config.Auth.Enabled()})
}

// recordLoginAttempt checks the fixed window and counts this attempt atomically.
func (auth *authState) recordLoginAttempt(clientIP string, now time.Time) bool {
	auth.mu.Lock()
	defer auth.mu.Unlock()
	maps.DeleteFunc(auth.attempts, func(_ string, attempt loginAttempt) bool {
		return !now.Before(attempt.resetAt)
	})
	attempt := auth.attempts[clientIP]
	if attempt.count >= maxLoginAttempts || (attempt.count == 0 && len(auth.attempts) >= maxTrackedLoginClients) {
		return false
	}
	if attempt.count == 0 {
		attempt.resetAt = now.Add(loginAttemptWindow)
	}
	attempt.count++
	auth.attempts[clientIP] = attempt
	return true
}

func decodeLoginCredentials(body io.Reader) (loginCredentials, error) {
	var credentials loginCredentials
	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&credentials); err != nil {
		return loginCredentials{}, err
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return loginCredentials{}, errors.New("login request must contain one JSON value")
	}
	return credentials, nil
}

func (server *httpServer) credentialsMatch(credentials loginCredentials) bool {
	usernameHash := sha256.Sum256([]byte(credentials.Username))
	expectedUsernameHash := sha256.Sum256([]byte(server.config.Auth.Username))
	passwordHash := sha256.Sum256([]byte(credentials.Password))
	expectedPasswordHash := sha256.Sum256([]byte(server.config.Auth.Password))
	credentialsEqual := subtle.ConstantTimeCompare(usernameHash[:], expectedUsernameHash[:]) &
		subtle.ConstantTimeCompare(passwordHash[:], expectedPasswordHash[:])
	return credentialsEqual == 1 && server.config.Auth.Username != "" && server.config.Auth.Password != ""
}

// createSession prunes expired sessions, replaces the caller's cookie, and resets
// its login attempts under one lock. Capacity is checked before replacement.
func (auth *authState) createSession(clientIP, token, previousToken string, now time.Time) bool {
	auth.mu.Lock()
	defer auth.mu.Unlock()
	maps.DeleteFunc(auth.sessions, func(_ string, expiresAt time.Time) bool {
		return !now.Before(expiresAt)
	})
	_, replacing := auth.sessions[previousToken]
	if !replacing && len(auth.sessions) >= maxActiveSessions {
		return false
	}
	delete(auth.sessions, previousToken)
	auth.sessions[token] = now.Add(sessionLifetime)
	delete(auth.attempts, clientIP)
	return true
}
