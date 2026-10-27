package app

import (
	"bufio"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
	"navi/internal/favicon"
	"navi/internal/navigation"
)

// httpOptions supplies the minimal dependencies required by the HTTP server.
type httpOptions struct {
	Config   config.Config
	Version  string
	Catalog  *catalog.Store
	Watcher  *catalog.Watcher
	Icons    *favicon.Store
	Resolver *navigation.Resolver
	Static   fs.FS
	Degraded func() (bool, string)
	Logger   *slog.Logger
}

// httpServer exposes authentication, read-only navigation, health, and static resources.
type httpServer struct {
	config    config.Config
	version   string
	catalog   *catalog.Store
	watcher   *catalog.Watcher
	icons     *favicon.Store
	resolver  *navigation.Resolver
	static    fs.FS
	files     http.Handler
	degraded  func() (bool, string)
	logger    *slog.Logger
	heartbeat time.Duration
	auth      *authState
	mux       *http.ServeMux
	handler   http.Handler
}

// newHTTPServer builds the Navi HTTP server handler.
func newHTTPServer(options httpOptions) (*httpServer, error) {
	if options.Catalog == nil {
		return nil, errors.New("HTTP API requires a catalog store")
	}
	s := &httpServer{
		config: options.Config, version: options.Version, catalog: options.Catalog, watcher: options.Watcher,
		icons: options.Icons, resolver: options.Resolver, static: options.Static, degraded: options.Degraded,
		logger: options.Logger, heartbeat: 15 * time.Second, auth: newAuthState(),
	}
	if s.logger == nil {
		s.logger = slog.New(slog.DiscardHandler)
	}
	if options.Static != nil {
		s.files = http.FileServer(http.FS(options.Static))
	}
	s.mux = s.routes()
	s.handler = s.middleware(s.mux)
	return s, nil
}

// ServeHTTP serves the route table through the shared middleware.
func (s *httpServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

// routes is the route table. GET patterns also match HEAD.
func (s *httpServer) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.serveHealth)
	mux.HandleFunc("GET /api/info", s.serveInfo)
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("GET /api/auth/session", s.requireSession(s.serveSession))
	mux.HandleFunc("GET /api/catalog", s.requireSession(s.serveCatalog))
	mux.HandleFunc("GET /api/status", s.requireSession(s.serveStatus))
	mux.HandleFunc("GET /api/events", s.requireSession(s.serveEvents))
	mux.HandleFunc("GET /api/icons/{runtime_id}", s.requireSession(s.serveIcon))
	mux.HandleFunc("GET /go/{runtime_id}", s.requirePage(s.serveGo))
	mux.HandleFunc("GET /go", s.requirePage(s.serveGo))
	mux.HandleFunc("GET /go/{$}", s.requirePage(s.serveGo))
	mux.HandleFunc("GET /", s.serveStatic)
	return mux
}

// middleware wraps next in the shared request handling, outermost first:
// request ID, access log, panic recovery, security headers, the cross-site
// write check and the JSON form of the router's own 404 / 405 responses.
func (s *httpServer) middleware(next http.Handler) http.Handler {
	protection := http.NewCrossOriginProtection()
	protection.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, errOriginRejected)
	}))
	guarded := protection.Handler(next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if !requestIDPattern.MatchString(requestID) {
			requestID = rand.Text()
		}
		w.Header().Set("X-Request-ID", requestID)
		logger := s.logger.With("request_id", requestID)
		r = r.WithContext(context.WithValue(r.Context(), loggerKey{}, logger))
		recorder := &responseRecorder{ResponseWriter: w}
		started := time.Now()
		defer s.logAccess(logger, accessRecord{Request: r, Response: recorder, Started: started})
		defer recoverPanic(recorder, r, logger)
		setSecurityHeaders(recorder.Header(), r)
		guarded.ServeHTTP(&routerErrorWriter{responseRecorder: recorder, request: r}, r)
	})
}

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

type loggerKey struct{}

// requestLogger returns the logger carrying the request ID.
func requestLogger(r *http.Request) *slog.Logger {
	if logger, ok := r.Context().Value(loggerKey{}).(*slog.Logger); ok {
		return logger
	}
	return slog.New(slog.DiscardHandler)
}

func setSecurityHeaders(header http.Header, r *http.Request) {
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
	header.Set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
	if isAPIPath(r.URL.Path) {
		header.Set("Cache-Control", "no-store")
	}
}

// recoverPanic logs a handler panic and answers 500 internal unless the
// response has started. http.ErrAbortHandler keeps aborting the response.
func recoverPanic(w *responseRecorder, r *http.Request, logger *slog.Logger) {
	recovered := recover()
	if recovered == nil {
		return
	}
	if recovered == http.ErrAbortHandler {
		panic(recovered)
	}
	logger.Error("http_handler_panic", "method", r.Method, "path", r.URL.Path, "error", fmt.Sprint(recovered))
	if !w.wroteHeader {
		writeError(w, r, errInternal)
	}
}

// accessRecord groups the inputs for logAccess.
type accessRecord struct {
	Request  *http.Request
	Response *responseRecorder
	Started  time.Time
}

func (s *httpServer) logAccess(logger *slog.Logger, options accessRecord) {
	r, w, started := options.Request, options.Response, options.Started

	if !s.config.Logging.AccessLog || (!s.config.Logging.LogHealthChecks && r.URL.Path == healthPath) {
		return
	}
	status := w.status
	if status == 0 {
		status = http.StatusOK
	}
	logger.Info("http_request",
		"method", r.Method,
		"path", r.URL.Path,
		"status", status,
		"duration_ms", time.Since(started).Milliseconds(),
		"bytes", w.bytes,
	)
}

// allowedMethods lists the methods another route serves for r's API path; the
// page fallback "GET /" would otherwise answer every GET with 404 instead of 405.
func (s *httpServer) allowedMethods(r *http.Request) string {
	var allowed []string
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		probe := r.Clone(r.Context())
		probe.Method = method
		if _, pattern := s.mux.Handler(probe); pattern != "" && pattern != "GET /" {
			allowed = append(allowed, method)
		}
	}
	return strings.Join(allowed, ", ")
}

// healthPath is the unauthenticated health check (代码规范.md §5.1).
const healthPath = "/healthz"

// routerErrorWriter replaces the router's plain-text 404 and 405 responses
// with the JSON error body. Handlers write JSON errors themselves.
type routerErrorWriter struct {
	*responseRecorder
	request  *http.Request
	replaced bool
}

func (w *routerErrorWriter) WriteHeader(status int) {
	plainText := strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain")
	if !w.wroteHeader && plainText && (status == http.StatusNotFound || status == http.StatusMethodNotAllowed) {
		w.replaced = true
		w.Header().Del("Content-Length")
		if status == http.StatusNotFound {
			writeError(w.responseRecorder, w.request, errNoRoute)
		} else {
			writeError(w.responseRecorder, w.request, errMethodNotAllowed)
		}
		return
	}
	w.responseRecorder.WriteHeader(status)
}

func (w *routerErrorWriter) Write(payload []byte) (int, error) {
	if w.replaced {
		return len(payload), nil
	}
	return w.responseRecorder.Write(payload)
}

// responseRecorder preserves the optional interfaces used by SSE and static
// file serving while collecting final HTTP status and response bytes.
type responseRecorder struct {
	http.ResponseWriter
	status      int
	bytes       int64
	wroteHeader bool
}

func (r *responseRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

func (r *responseRecorder) WriteHeader(status int) {
	if r.wroteHeader {
		return
	}
	r.status = status
	r.wroteHeader = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(payload []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	count, err := r.ResponseWriter.Write(payload)
	r.bytes += int64(count)
	return count, err
}

func (r *responseRecorder) ReadFrom(reader io.Reader) (int64, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	count, err := io.Copy(r.ResponseWriter, reader)
	r.bytes += count
	return count, err
}

func (r *responseRecorder) Flush() {
	_ = r.FlushError()
}

func (r *responseRecorder) FlushError() error {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	return http.NewResponseController(r.ResponseWriter).Flush()
}

func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hijacker, ok := r.ResponseWriter.(http.Hijacker); ok {
		return hijacker.Hijack()
	}
	return nil, nil, http.ErrNotSupported
}

func isAPIPath(path string) bool {
	return path == "/api" || strings.HasPrefix(path, "/api/")
}
