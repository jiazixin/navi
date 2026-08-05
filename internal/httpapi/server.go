// Package httpapi provides Navi's read-only HTTP surface.
package httpapi

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
	"navi/internal/favicon"
	"navi/internal/navigation"
)

// Options supplies the minimal dependencies required by the HTTP server.
type Options struct {
	Config   config.Config
	Catalog  *catalog.Store
	Watcher  *catalog.Watcher
	Icons    *favicon.Store
	Resolver *navigation.Resolver
	Static   fs.FS
	Degraded func() (bool, string)
	Logger   *slog.Logger
}

// Server exposes read-only API, navigation, health, and embedded static resources.
type Server struct {
	config    config.Config
	catalog   *catalog.Store
	watcher   *catalog.Watcher
	icons     *favicon.Store
	resolver  *navigation.Resolver
	static    fs.FS
	files     http.Handler
	degraded  func() (bool, string)
	logger    *slog.Logger
	heartbeat time.Duration
	request   atomic.Uint64
}

// New builds a read-only HTTP server handler.
func New(options Options) (*Server, error) {
	if options.Catalog == nil {
		return nil, fmt.Errorf("HTTP API requires a catalog store")
	}
	server := &Server{
		config: options.Config, catalog: options.Catalog, watcher: options.Watcher, icons: options.Icons,
		resolver: options.Resolver, static: options.Static, degraded: options.Degraded, logger: options.Logger,
		heartbeat: 15 * time.Second,
	}
	if server.logger == nil {
		server.logger = slog.Default()
	}
	if options.Static != nil {
		server.files = http.FileServer(http.FS(options.Static))
	}
	return server, nil
}

// ServeHTTP handles only read-only Navi routes and static assets.
func (s *Server) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	requestID := s.requestID()
	writer.Header().Set("X-Request-ID", requestID)
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.Header().Set("Referrer-Policy", "no-referrer")
	writer.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
	writer.Header().Set("X-Frame-Options", "DENY")
	writer.Header().Set("Content-Security-Policy", "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'")

	started := time.Now()
	recorder := &responseRecorder{ResponseWriter: writer}
	defer func() {
		if recovered := recover(); recovered != nil {
			s.logger.Error("HTTP handler panic", "request_id", requestID, "method", request.Method, "route", request.URL.Path, "error", recovered)
			writeJSONError(recorder, http.StatusInternalServerError, "服务暂时无法完成请求。")
		}
		s.logAccess(request, requestID, recorder, time.Since(started))
	}()
	writer = recorder
	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		writer.Header().Set("Allow", "GET, HEAD, OPTIONS")
		writeJSONError(writer, http.StatusMethodNotAllowed, "只支持只读请求。")
		return
	}

	switch request.URL.Path {
	case "/api/catalog":
		s.serveCatalog(writer, request)
	case "/api/status":
		s.serveStatus(writer, request)
	case "/api/events":
		s.serveEvents(writer, request)
	case s.config.Health.URI:
		s.serveHealth(writer, request)
	default:
		if hasPrefixPath(request.URL.Path, "/api/icons/") {
			s.serveIcon(writer, request)
			return
		}
		if request.URL.Path == "/api" || hasPrefixPath(request.URL.Path, "/api/") {
			writeJSONError(writer, http.StatusNotFound, "接口不存在。")
			return
		}
		if request.URL.Path == "/go" || hasPrefixPath(request.URL.Path, "/go/") {
			s.serveGo(writer, request)
			return
		}
		s.serveStatic(writer, request)
	}
}

func (s *Server) logAccess(request *http.Request, requestID string, recorder *responseRecorder, duration time.Duration) {
	if !s.config.Logging.AccessLog {
		return
	}
	if !s.config.Logging.LogHealthChecks && request.URL.Path == s.config.Health.URI {
		return
	}
	status := recorder.status
	if status == 0 {
		status = http.StatusOK
	}
	s.logger.Info("HTTP request",
		"request_id", requestID,
		"method", request.Method,
		"route", request.URL.Path,
		"status", status,
		"duration", duration,
		"bytes", recorder.bytes,
	)
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

func (r *responseRecorder) WriteString(payload string) (int, error) {
	if writer, ok := r.ResponseWriter.(io.StringWriter); ok {
		if !r.wroteHeader {
			r.WriteHeader(http.StatusOK)
		}
		count, err := writer.WriteString(payload)
		r.bytes += int64(count)
		return count, err
	}
	return r.Write([]byte(payload))
}

func (r *responseRecorder) ReadFrom(reader io.Reader) (int64, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	if source, ok := r.ResponseWriter.(io.ReaderFrom); ok {
		count, err := source.ReadFrom(reader)
		r.bytes += count
		return count, err
	}
	count, err := io.Copy(r.ResponseWriter, reader)
	r.bytes += count
	return count, err
}

func (r *responseRecorder) Flush() {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hijacker, ok := r.ResponseWriter.(http.Hijacker); ok {
		return hijacker.Hijack()
	}
	return nil, nil, http.ErrNotSupported
}

func (r *responseRecorder) Push(target string, options *http.PushOptions) error {
	if pusher, ok := r.ResponseWriter.(http.Pusher); ok {
		return pusher.Push(target, options)
	}
	return http.ErrNotSupported
}

func (s *Server) requestID() string {
	var buffer [9]byte
	if _, err := rand.Read(buffer[:]); err == nil {
		return base64.RawURLEncoding.EncodeToString(buffer[:])
	}
	return fmt.Sprintf("req-%d", s.request.Add(1))
}

func hasPrefixPath(path, prefix string) bool {
	return len(path) >= len(prefix) && path[:len(prefix)] == prefix
}
