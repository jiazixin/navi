// Package httpapi provides Navi's read-only HTTP surface.
package httpapi

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io/fs"
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
		resolver: options.Resolver, static: options.Static, degraded: options.Degraded, heartbeat: 15 * time.Second,
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

	defer func() {
		if recover() != nil {
			writeJSONError(writer, http.StatusInternalServerError, "服务暂时无法完成请求。")
		}
	}()
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
		if hasPrefixPath(request.URL.Path, "/api/") {
			writeJSONError(writer, http.StatusNotFound, "接口不存在。")
			return
		}
		if hasPrefixPath(request.URL.Path, "/go/") {
			s.serveGo(writer, request)
			return
		}
		s.serveStatic(writer, request)
	}
}

func (s *Server) requestID() string {
	var buffer [9]byte
	if _, err := rand.Read(buffer[:]); err == nil {
		return base64.RawURLEncoding.EncodeToString(buffer[:])
	}
	return fmt.Sprintf("req-%d", s.request.Add(1))
}

func hasPrefixPath(path, prefix string) bool {
	return len(path) > len(prefix) && path[:len(prefix)] == prefix
}
