package app

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json/v2"
	"errors"
	"maps"
	"mime"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookie          = "navi_session"
	sessionLifetime        = 24 * time.Hour
	loginAttemptWindow     = time.Minute
	maxLoginAttempts       = 5
	maxTrackedLoginClients = 4096
	maxActiveSessions      = 4096
	maxLoginRequestBytes   = 8192
)

type loginAttempt struct {
	count   int
	resetAt time.Time
}

// authState holds the in-memory sessions and login attempts; mu guards both maps.
type authState struct {
	mu       sync.Mutex
	sessions map[[sha256.Size]byte]time.Time
	now      func() time.Time
	attempts map[string]loginAttempt
}

func newAuthState() *authState {
	return &authState{sessions: make(map[[sha256.Size]byte]time.Time), now: time.Now, attempts: make(map[string]loginAttempt)}
}

func (s *httpServer) authenticated(r *http.Request) bool {
	if !s.config.Auth.Enabled() {
		return true
	}
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	s.auth.mu.Lock()
	defer s.auth.mu.Unlock()
	digest := sessionDigest(cookie.Value)
	var expiresAt time.Time
	// Compare the bounded set of stored digests without prefix-dependent equality.
	// Do not stop at the match: map iteration order must not affect authentication.
	for stored, expiry := range s.auth.sessions {
		if subtle.ConstantTimeCompare(digest[:], stored[:]) == 1 {
			expiresAt = expiry
		}
	}
	if !s.auth.now().Before(expiresAt) {
		delete(s.auth.sessions, digest)
		return false
	}
	return true
}

// requireSession answers an API request without a session with 401.
func (s *httpServer) requireSession(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.authenticated(r) {
			writeError(w, r, errLoginRequired)
			return
		}
		next(w, r)
	}
}

// requirePage sends a page request without a session to the login page.
func (s *httpServer) requirePage(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.authenticated(r) {
			w.Header().Set("Cache-Control", "no-store")
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		next(w, r)
	}
}

func (s *httpServer) serveSession(w http.ResponseWriter, r *http.Request) {
	s.writeSession(w, r)
}

func (s *httpServer) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		s.auth.mu.Lock()
		delete(s.auth.sessions, sessionDigest(cookie.Value))
		s.auth.mu.Unlock()
	}
	s.setSessionCookie(w, r, sessionCookieOptions{Token: "", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

// sessionCookieOptions groups the inputs for setSessionCookie.
type sessionCookieOptions struct {
	Token  string
	MaxAge int
}

// String redacts the reusable session token from diagnostics.
func (o sessionCookieOptions) String() string { return "sessionCookieOptions{[REDACTED]}" }

// GoString redacts Go-syntax formatting of the token.
func (o sessionCookieOptions) GoString() string { return o.String() }

func (s *httpServer) setSessionCookie(w http.ResponseWriter, r *http.Request, options sessionCookieOptions) {
	token, maxAge := options.Token, options.MaxAge

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.config.Auth.SecureCookie || r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
	})
}

type loginCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *httpServer) login(w http.ResponseWriter, r *http.Request) {
	clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		clientIP = r.RemoteAddr
	}
	now := s.auth.now()
	if !s.auth.recordLoginAttempt(clientIP, now) {
		w.Header().Set("Retry-After", strconv.Itoa(int(loginAttemptWindow.Seconds())))
		writeError(w, r, errLoginLimited)
		return
	}
	credentials, err := decodeLogin(w, r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if !s.credentialsMatch(credentials) {
		writeError(w, r, errBadLogin)
		return
	}
	token := rand.Text()
	previousToken := ""
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		previousToken = cookie.Value
	}
	if !s.auth.createSession(sessionRequest{ClientIP: clientIP, Token: token, PreviousToken: previousToken, Now: now}) {
		writeError(w, r, errSessionsExhausted)
		return
	}
	s.setSessionCookie(w, r, sessionCookieOptions{Token: token, MaxAge: int(sessionLifetime.Seconds())})
	s.writeSession(w, r)
}

// decodeLogin reads one JSON login object, rejecting other media types,
// oversized bodies and unknown members.
func decodeLogin(w http.ResponseWriter, r *http.Request) (loginCredentials, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return loginCredentials{}, errNotJSON
	}
	var credentials loginCredentials
	err = json.UnmarshalRead(http.MaxBytesReader(w, r.Body, maxLoginRequestBytes), &credentials, json.RejectUnknownMembers(true))
	if _, tooLarge := errors.AsType[*http.MaxBytesError](err); tooLarge {
		return loginCredentials{}, errLoginTooLarge
	}
	if err != nil {
		return loginCredentials{}, errLoginBody
	}
	fields := []map[string]string{}
	if len(credentials.Username) == 0 || len(credentials.Username) > 128 {
		fields = append(fields, map[string]string{"path": "username", "reason": "invalid_length"})
	}
	if len(credentials.Password) == 0 || len(credentials.Password) > 72 {
		fields = append(fields, map[string]string{"path": "password", "reason": "invalid_length"})
	}
	if len(fields) != 0 {
		return loginCredentials{}, &apiFailure{status: http.StatusBadRequest, code: "invalid_argument", message: "login fields have invalid lengths", details: map[string]any{"fields": fields}}
	}
	return credentials, nil
}

// sessionResponse reports an authenticated session and whether login is configured.
type sessionResponse struct {
	Authenticated bool `json:"authenticated"`
	AuthRequired  bool `json:"auth_required"`
}

func (s *httpServer) writeSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, r, jsonResponse{Status: http.StatusOK, Payload: sessionResponse{Authenticated: true, AuthRequired: s.config.Auth.Enabled()}})
}

// recordLoginAttempt checks the fixed window and counts this attempt atomically.
func (a *authState) recordLoginAttempt(clientIP string, now time.Time) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	maps.DeleteFunc(a.attempts, func(_ string, attempt loginAttempt) bool {
		return !now.Before(attempt.resetAt)
	})
	attempt := a.attempts[clientIP]
	if attempt.count >= maxLoginAttempts || (attempt.count == 0 && len(a.attempts) >= maxTrackedLoginClients) {
		return false
	}
	if attempt.count == 0 {
		attempt.resetAt = now.Add(loginAttemptWindow)
	}
	attempt.count++
	a.attempts[clientIP] = attempt
	return true
}

func (s *httpServer) credentialsMatch(credentials loginCredentials) bool {
	if len(credentials.Username) == 0 || len(credentials.Username) > 128 || len(credentials.Password) == 0 || len(credentials.Password) > 72 {
		return false
	}
	usernameHash := sha256.Sum256([]byte(credentials.Username))
	expectedUsernameHash := sha256.Sum256([]byte(s.config.Auth.Username))
	passwordErr := bcrypt.CompareHashAndPassword([]byte(s.config.Auth.PasswordHash), []byte(credentials.Password))
	return subtle.ConstantTimeCompare(usernameHash[:], expectedUsernameHash[:]) == 1 && passwordErr == nil && s.config.Auth.Enabled()
}

// sessionRequest groups the inputs for createSession.
type sessionRequest struct {
	ClientIP      string
	Token         string
	PreviousToken string
	Now           time.Time
}

// String redacts the reusable current and replacement session tokens.
func (s sessionRequest) String() string { return "sessionRequest{[REDACTED]}" }

// GoString redacts Go-syntax formatting of the session request.
func (s sessionRequest) GoString() string { return s.String() }

// createSession prunes expired sessions, replaces the caller's cookie, and resets
// its login attempts under one lock. Capacity is checked before replacement.
func (a *authState) createSession(options sessionRequest) bool {
	clientIP, token, previousToken, now := options.ClientIP, options.Token, options.PreviousToken, options.Now

	a.mu.Lock()
	defer a.mu.Unlock()
	maps.DeleteFunc(a.sessions, func(_ [sha256.Size]byte, expiresAt time.Time) bool {
		return !now.Before(expiresAt)
	})
	_, replacing := a.sessions[sessionDigest(previousToken)]
	if !replacing && len(a.sessions) >= maxActiveSessions {
		return false
	}
	delete(a.sessions, sessionDigest(previousToken))
	a.sessions[sessionDigest(token)] = now.Add(sessionLifetime)
	delete(a.attempts, clientIP)
	return true
}

// sessionDigest ensures the server never retains a reusable cookie token.
func sessionDigest(token string) [sha256.Size]byte { return sha256.Sum256([]byte(token)) }

// String prevents accidental logging of submitted credentials.
func (c loginCredentials) String() string { return "loginCredentials{[REDACTED]}" }

// GoString redacts diagnostic formatting of submitted credentials.
func (c loginCredentials) GoString() string { return c.String() }
