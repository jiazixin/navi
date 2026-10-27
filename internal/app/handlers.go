package app

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"errors"
	"fmt"
	"html"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"navi/internal/catalog"
	"navi/internal/favicon"
)

type catalogResponse struct {
	Revision uint64         `json:"revision"`
	Pages    []pageResponse `json:"pages"`
}

type pageResponse struct {
	ID       string          `json:"id"`
	Title    string          `json:"title"`
	Subtitle string          `json:"subtitle,omitzero"`
	Groups   []groupResponse `json:"groups"`
}

type groupResponse struct {
	Name  string         `json:"name"`
	Links []linkResponse `json:"links"`
}

type linkResponse struct {
	RuntimeID   string   `json:"runtime_id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitzero"`
	PrivateURL  string   `json:"private_url,omitzero"`
	PublicURL   string   `json:"public_url,omitzero"`
	Tags        []string `json:"tags"`
}

// Service health values reported by /api/status and the health endpoint.
const (
	healthOK          = "ok"
	healthDegraded    = "degraded"
	healthUnavailable = "unavailable"
)

// statusResponse reports service health. Code names the cause of degraded or
// unavailable health for clients; Message is its English description.
type statusResponse struct {
	Health   string `json:"health"`
	Revision uint64 `json:"revision"`
	Code     string `json:"code,omitzero"`
	Message  string `json:"message,omitzero"`
}

// Status codes and their English descriptions.
var statusMessages = map[string]string{
	catalog.StatusUnavailable:  "catalog not available yet",
	catalog.StatusReloadFailed: "catalog reload failed; the last valid catalog stays active",
	statusIconCacheUnavailable: "icon cache unavailable; monograms are used",
	favicon.StatusWriteFailed:  "icon cache writes failed; existing icons or monograms are used",
}

const statusIconCacheUnavailable = "icon_cache_unavailable"

func degradedStatus(revision uint64, code string) statusResponse {
	return statusResponse{Health: healthDegraded, Revision: revision, Code: code, Message: statusMessages[code]}
}

func (s *httpServer) serveCatalog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		writeError(w, r, errCatalogMissing)
		return
	}
	w.Header().Set("ETag", snapshot.ETag())
	if r.Header.Get("If-None-Match") == snapshot.ETag() {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	writeJSON(w, r, jsonResponse{Status: http.StatusOK, Payload: s.catalogResponse(snapshot)})
}

func (s *httpServer) catalogResponse(snapshot *catalog.Snapshot) catalogResponse {
	directory := snapshot.Catalog()
	pages := make([]pageResponse, len(directory.Pages))
	for pageIndex, page := range directory.Pages {
		groups := make([]groupResponse, len(page.Groups))
		for groupIndex, group := range page.Groups {
			links := make([]linkResponse, len(group.Links))
			for linkIndex, link := range group.Links {
				links[linkIndex] = linkResponse{
					RuntimeID: link.RuntimeID, Name: link.Name, Description: link.Description,
					PrivateURL: link.PrivateURL, PublicURL: link.PublicURL, Tags: append([]string{}, link.Tags...),
				}
			}
			groups[groupIndex] = groupResponse{Name: group.Name, Links: links}
		}
		pages[pageIndex] = pageResponse{
			ID: page.ID, Title: page.Title, Subtitle: page.Subtitle, Groups: groups,
		}
	}
	return catalogResponse{Revision: snapshot.Revision(), Pages: pages}
}

func (s *httpServer) serveStatus(w http.ResponseWriter, r *http.Request) {
	status := s.status()
	if status.Health == healthUnavailable {
		writeError(w, r, errCatalogMissing)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, r, jsonResponse{Status: http.StatusOK, Payload: status})
}

// serveHealth reports that the process serves requests; degraded details are
// in /api/status. It needs no session.
func (s *httpServer) serveHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s.status().Health == healthUnavailable {
		writeError(w, r, errCatalogMissing)
		return
	}
	writeJSON(w, r, jsonResponse{Status: http.StatusOK, Payload: map[string]string{"status": "ok"}})
}

// infoResponse lists the server version and the optional features clients may
// check before using them (代码规范.md §5.1).
type infoResponse struct {
	Version      string   `json:"version"`
	Capabilities []string `json:"capabilities"`
}

func (s *httpServer) serveInfo(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, r, jsonResponse{Status: http.StatusOK, Payload: infoResponse{Version: s.version, Capabilities: []string{"catalog_events", "favicons"}}})
}

func (s *httpServer) serveEvents(w http.ResponseWriter, r *http.Request) {
	var events <-chan catalog.Event
	if s.watcher != nil {
		subscription := s.watcher.Subscribe()
		defer subscription.Close()
		events = subscription.Events()
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	controller := http.NewResponseController(w)
	writeTimeout := s.config.Server.WriteTimeout
	if writeTimeout <= 0 {
		writeTimeout = 30 * time.Second
	}
	// Idle streams may live indefinitely, but each write has a bounded lifetime.
	// Cancellation interrupts a write blocked on a client that stopped reading.
	writeCanceled := make(chan struct{})
	stop := context.AfterFunc(r.Context(), func() {
		defer close(writeCanceled)
		_ = controller.SetWriteDeadline(time.Now())
	})
	defer func() {
		if !stop() {
			<-writeCanceled
		}
	}()
	beginWrite := func() error {
		err := controller.SetWriteDeadline(time.Now().Add(writeTimeout))
		if contextErr := r.Context().Err(); contextErr != nil {
			_ = controller.SetWriteDeadline(time.Now())
			return contextErr
		}
		if errors.Is(err, http.ErrNotSupported) {
			return nil
		}
		return err
	}
	flushWrite := func() error {
		if err := controller.Flush(); err != nil {
			return err
		}
		// The deadline applies to a frame, not the idle gap before the next one.
		err := controller.SetWriteDeadline(time.Time{})
		if errors.Is(err, http.ErrNotSupported) {
			return nil
		}
		return err
	}
	writeFrame := func(frame string) error {
		if err := beginWrite(); err != nil {
			return err
		}
		if _, err := w.Write([]byte(frame)); err != nil {
			return err
		}
		return flushWrite()
	}
	// Send the response headers before waiting for the first event.
	if err := beginWrite(); err != nil {
		return
	}
	if err := flushWrite(); err != nil {
		return
	}

	heartbeat := time.NewTicker(s.heartbeat)
	defer heartbeat.Stop()
	for {
		var frame string
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok || !s.authenticated(r) {
				return
			}
			payload, err := json.Marshal(event)
			if err != nil {
				requestLogger(r).Error("event_encode_failed", "error", err)
				return
			}
			frame = fmt.Sprintf("event: %s\ndata: %s\n\n", event.Type, payload)
		case <-heartbeat.C:
			if !s.authenticated(r) {
				return
			}
			frame = ": heartbeat\n\n"
		}
		if err := writeFrame(frame); err != nil {
			return
		}
	}
}

func (s *httpServer) serveIcon(w http.ResponseWriter, r *http.Request) {
	if s.icons == nil {
		writeError(w, r, errIconsUnavailable)
		return
	}
	runtimeID := r.PathValue("runtime_id")
	entry, file, err := s.icons.Open(r.Context(), runtimeID)
	if errors.Is(err, favicon.ErrNotFound) {
		writeError(w, r, errIconNotFound)
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	defer file.Close() // Read-only descriptor; failures cannot invalidate the completed read.
	w.Header().Set("ETag", entry.ETag)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", entry.ContentType)
	if entry.ContentType == "image/svg+xml" {
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	}
	if r.Header.Get("If-None-Match") == entry.ETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	http.ServeContent(w, r, "icon", entry.FetchedAt, file)
}

func (s *httpServer) serveGo(w http.ResponseWriter, r *http.Request) {
	runtimeID := r.PathValue("runtime_id")
	if runtimeID == "" {
		s.writeFailurePage(w, r, failurePage{Status: http.StatusNotFound, Code: navigationLinkNotFound})
		return
	}
	if s.resolver == nil {
		s.writeFailurePage(w, r, failurePage{Status: http.StatusServiceUnavailable, Code: navigationLinkUnavailable})
		return
	}
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		s.writeFailurePage(w, r, failurePage{Status: http.StatusServiceUnavailable, Code: navigationCatalogUnavailable})
		return
	}
	link, ok := snapshot.FindLink(runtimeID)
	if !ok {
		s.writeFailurePage(w, r, failurePage{Status: http.StatusNotFound, Code: navigationLinkNotFound})
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, s.resolver.Resolve(r.Context(), link), http.StatusFound)
}

// serveStatic serves the web client. Every page except the login page and
// its assets needs a session; unknown API paths answer 404.
func (s *httpServer) serveStatic(w http.ResponseWriter, r *http.Request) {
	if isAPIPath(r.URL.Path) {
		if allowed := s.allowedMethods(r); allowed != "" {
			w.Header().Set("Allow", allowed)
			writeError(w, r, errMethodNotAllowed)
			return
		}
		writeError(w, r, errNoRoute)
		return
	}
	public := r.URL.Path == "/login" || r.URL.Path == "/assets" || strings.HasPrefix(r.URL.Path, "/assets/")
	if !public && !s.authenticated(r) {
		w.Header().Set("Cache-Control", "no-store")
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	if s.static == nil || s.files == nil {
		writeError(w, r, errFrontendMissing)
		return
	}
	filePath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if filePath != "." && filePath != "" && filePath != "index.html" {
		if info, err := fs.Stat(s.static, filePath); err == nil && info.Mode().IsRegular() {
			s.files.ServeHTTP(w, r)
			return
		}
	}
	if r.URL.Path == "/assets" || strings.HasPrefix(r.URL.Path, "/assets/") {
		writeError(w, r, errAssetNotFound)
		return
	}
	contents, err := fs.ReadFile(s.static, "index.html")
	if err != nil {
		writeError(w, r, errFrontendMissing)
		return
	}
	contents = bytes.Replace(contents, []byte(`id="root"`), fmt.Appendf(nil, `id="root"%s`, s.appearanceAttributes()), 1)
	w.Header().Set("Cache-Control", "no-store")
	if r.URL.Path != "/" && r.URL.Path != "/login" {
		// The SPA renders its not-found page; unknown paths are never home aliases.
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		if r.Method != http.MethodHead {
			// A write failure after headers only means the client stopped reading.
			_, _ = w.Write(contents)
		}
		return
	}
	http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(contents))
}

func (s *httpServer) status() statusResponse {
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		code := catalog.StatusUnavailable
		return statusResponse{Health: healthUnavailable, Code: code, Message: statusMessages[code]}
	}
	if s.watcher != nil {
		if degraded, code := s.watcher.Degraded(); degraded {
			return degradedStatus(snapshot.Revision(), code)
		}
	}
	if s.degraded != nil {
		if degraded, code := s.degraded(); degraded {
			return degradedStatus(snapshot.Revision(), code)
		}
	}
	return statusResponse{Health: healthOK, Revision: snapshot.Revision()}
}

// Navigation failure codes passed to the web client in data-navigation-error.
const (
	navigationLinkNotFound       = "link_not_found"
	navigationLinkUnavailable    = "link_unavailable"
	navigationCatalogUnavailable = "catalog_unavailable"
)

// failurePage groups the inputs for writeFailurePage.
type failurePage struct {
	Status int
	Code   string
}

func (s *httpServer) writeFailurePage(w http.ResponseWriter, r *http.Request, options failurePage) {
	w.Header().Set("Cache-Control", "no-store")
	if s.static == nil {
		writeError(w, r, errFrontendMissing)
		return
	}
	shell, err := fs.ReadFile(s.static, "index.html")
	emptyRoot := []byte(`<div id="root"></div>`)
	if err != nil || !bytes.Contains(shell, emptyRoot) {
		writeError(w, r, errFrontendMissing)
		return
	}
	retryPath := r.URL.EscapedPath()
	// Only a local navigation route can be used as the retry destination.
	if !strings.HasPrefix(retryPath, "/go/") {
		retryPath = "/"
	}
	root := fmt.Sprintf(`<div id="root" data-navigation-error="%s" data-retry-path="%s"%s></div>`, html.EscapeString(options.Code), html.EscapeString(retryPath), s.appearanceAttributes())
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(options.Status)
	if r.Method == http.MethodHead {
		return
	}
	// Headers are already sent; a disconnected client needs no second response.
	_, _ = w.Write(bytes.Replace(shell, emptyRoot, []byte(root), 1))
}

// appearanceAttributes exposes the configured appearance defaults to the shell before
// authentication, so the login page and first paint use them without an API call.
func (s *httpServer) appearanceAttributes() string {
	return fmt.Sprintf(` data-configured-theme="%s" data-configured-pattern="%s" data-configured-search="%s"`,
		html.EscapeString(s.config.Theme), html.EscapeString(s.config.BackgroundPattern), html.EscapeString(s.config.WebSearch))
}
