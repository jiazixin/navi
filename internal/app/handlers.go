package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"navi/internal/catalog"
	"navi/internal/favicon"
	"navi/internal/navigation"
)

type catalogResponse struct {
	Revision          uint64         `json:"revision"`
	Theme             string         `json:"theme"`
	BackgroundPattern string         `json:"backgroundPattern"`
	WebSearch         string         `json:"webSearch"`
	Pages             []pageResponse `json:"pages"`
}

type pageResponse struct {
	ID       string          `json:"id"`
	Title    string          `json:"title"`
	Subtitle string          `json:"subtitle,omitempty"`
	Groups   []groupResponse `json:"groups"`
}

type groupResponse struct {
	Name  string         `json:"name"`
	Links []linkResponse `json:"links"`
}

type linkResponse struct {
	RuntimeID   string   `json:"runtimeId"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	PrivateURL  string   `json:"privateUrl,omitempty"`
	PublicURL   string   `json:"publicUrl,omitempty"`
	Tags        []string `json:"tags"`
}

type statusResponse struct {
	Health   string `json:"health"`
	Revision uint64 `json:"revision"`
	Message  string `json:"message,omitempty"`
}

func (s *httpServer) serveCatalog(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		writeJSONError(writer, http.StatusServiceUnavailable, "目录暂时不可用。")
		return
	}
	writer.Header().Set("ETag", snapshot.ETag())
	if request.Header.Get("If-None-Match") == snapshot.ETag() {
		writer.WriteHeader(http.StatusNotModified)
		return
	}
	writeJSON(writer, http.StatusOK, s.catalogResponse(snapshot))
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
	return catalogResponse{
		Revision: snapshot.Revision(), Theme: s.config.Theme,
		BackgroundPattern: s.config.BackgroundPattern, WebSearch: s.config.WebSearch,
		Pages: pages,
	}
}

func (s *httpServer) serveStatus(writer http.ResponseWriter, request *http.Request) {
	health, revision, message := s.status()
	status := http.StatusOK
	if health == "unavailable" {
		status = http.StatusServiceUnavailable
	}
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, status, statusResponse{Health: health, Revision: revision, Message: message})
}

func (s *httpServer) serveHealth(writer http.ResponseWriter, request *http.Request) {
	health, _, _ := s.status()
	if health == "unavailable" {
		writer.Header().Set("Cache-Control", "no-store")
		writer.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	if request.Method == http.MethodHead {
		writer.WriteHeader(http.StatusOK)
		return
	}
	if _, err := writer.Write([]byte(health)); err != nil {
		return
	}
}

func (s *httpServer) serveEvents(writer http.ResponseWriter, request *http.Request) {
	var events <-chan catalog.Event
	var subscription catalog.Subscription
	if s.watcher != nil {
		subscription = s.watcher.Subscribe()
		defer subscription.Close()
		events = subscription.Events()
	}
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Connection", "keep-alive")
	if request.Method == http.MethodHead {
		writer.WriteHeader(http.StatusOK)
		return
	}
	controller := http.NewResponseController(writer)
	writeTimeout := s.config.Server.WriteTimeout
	if writeTimeout <= 0 {
		writeTimeout = 30 * time.Second
	}
	// Idle streams may live indefinitely, but each write has a bounded lifetime.
	// Cancellation interrupts a write blocked on a client that stopped reading.
	writeCanceled := make(chan struct{})
	stop := context.AfterFunc(request.Context(), func() {
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
		if contextErr := request.Context().Err(); contextErr != nil {
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
	if err := beginWrite(); err != nil {
		return
	}
	if err := flushWrite(); err != nil {
		return
	}

	heartbeat := time.NewTicker(s.heartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-request.Context().Done():
			return
		case event, ok := <-events:
			if !s.authenticated(request) {
				return
			}
			if !ok {
				return
			}
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if err := beginWrite(); err != nil {
				return
			}
			if _, err := fmt.Fprintf(writer, "event: %s\ndata: %s\n\n", event.Type, payload); err != nil {
				return
			}
			if err := flushWrite(); err != nil {
				return
			}
		case <-heartbeat.C:
			if !s.authenticated(request) {
				return
			}
			if err := beginWrite(); err != nil {
				return
			}
			if _, err := fmt.Fprint(writer, ": heartbeat\n\n"); err != nil {
				return
			}
			if err := flushWrite(); err != nil {
				return
			}
		}
	}
}

func (s *httpServer) serveIcon(writer http.ResponseWriter, request *http.Request) {
	if s.icons == nil {
		writeJSONError(writer, http.StatusNotFound, "图标暂不可用。")
		return
	}
	runtimeID := strings.TrimPrefix(request.URL.Path, "/api/icons/")
	if runtimeID == "" || strings.Contains(runtimeID, "/") {
		writeJSONError(writer, http.StatusNotFound, "图标不存在。")
		return
	}
	entry, file, err := s.icons.Open(runtimeID)
	if errors.Is(err, favicon.ErrNotFound) {
		writeJSONError(writer, http.StatusNotFound, "图标不存在。")
		return
	}
	if err != nil {
		writeJSONError(writer, http.StatusInternalServerError, "图标暂时不可用。")
		return
	}
	defer file.Close()
	writer.Header().Set("ETag", entry.ETag)
	writer.Header().Set("Cache-Control", "public, no-cache")
	writer.Header().Set("Content-Type", entry.ContentType)
	if entry.ContentType == "image/svg+xml" {
		writer.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	}
	if request.Header.Get("If-None-Match") == entry.ETag {
		writer.WriteHeader(http.StatusNotModified)
		return
	}
	if request.Method == http.MethodHead {
		writer.WriteHeader(http.StatusOK)
		return
	}
	http.ServeContent(writer, request, "icon", entry.FetchedAt, file)
}

func (s *httpServer) serveGo(writer http.ResponseWriter, request *http.Request) {
	runtimeID := strings.TrimPrefix(request.URL.Path, "/go/")
	if runtimeID == "" || strings.Contains(runtimeID, "/") {
		s.writeFailurePage(writer, request, http.StatusNotFound, "链接不存在")
		return
	}
	if s.resolver == nil {
		s.writeFailurePage(writer, request, http.StatusServiceUnavailable, "链接暂时不可用")
		return
	}
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		s.writeFailurePage(writer, request, http.StatusServiceUnavailable, "目录暂时不可用")
		return
	}
	link, ok := snapshot.Catalog().FindLink(runtimeID)
	if !ok {
		s.writeFailurePage(writer, request, http.StatusNotFound, "链接不存在")
		return
	}
	resolve := s.resolver.Resolve
	if request.URL.Query().Get("retry") == "1" {
		resolve = s.resolver.Retry
	}
	target, err := resolve(request.Context(), link)
	if errors.Is(err, navigation.ErrUnreachable) {
		s.writeFailurePage(writer, request, http.StatusBadGateway, link.Name+" 当前无法访问")
		return
	}
	if err != nil {
		s.writeFailurePage(writer, request, http.StatusServiceUnavailable, "链接暂时不可用")
		return
	}
	writer.Header().Set("Cache-Control", "no-store")
	http.Redirect(writer, request, target, http.StatusFound)
}

func (s *httpServer) serveStatic(writer http.ResponseWriter, request *http.Request) {
	if s.static == nil || s.files == nil {
		writeJSONError(writer, http.StatusServiceUnavailable, "前端资源尚未构建。")
		return
	}
	filePath := strings.TrimPrefix(path.Clean(request.URL.Path), "/")
	if filePath != "." && filePath != "" {
		if _, err := fs.Stat(s.static, filePath); err == nil {
			s.files.ServeHTTP(writer, request)
			return
		}
	}
	contents, err := fs.ReadFile(s.static, "index.html")
	if err != nil {
		writeJSONError(writer, http.StatusServiceUnavailable, "前端资源尚未构建。")
		return
	}
	contents = bytes.Replace(contents, []byte(`id="root"`), []byte(`id="root" data-configured-theme="`+htmlEscape(s.config.Theme)+`"`), 1)
	writer.Header().Set("Cache-Control", "no-store")
	http.ServeContent(writer, request, "index.html", time.Time{}, bytes.NewReader(contents))
}

func (s *httpServer) status() (string, uint64, string) {
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		return "unavailable", 0, "目录尚不可用。"
	}
	if s.watcher != nil {
		if degraded, message := s.watcher.Degraded(); degraded {
			return "degraded", snapshot.Revision(), message
		}
	}
	if s.degraded != nil {
		if degraded, message := s.degraded(); degraded {
			return "degraded", snapshot.Revision(), message
		}
	}
	return "ok", snapshot.Revision(), ""
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		return
	}
}

func writeJSONError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"message": message})
}

func (s *httpServer) writeFailurePage(writer http.ResponseWriter, request *http.Request, status int, message string) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.WriteHeader(status)
	if request.Method == http.MethodHead {
		return
	}
	retryPath := request.URL.EscapedPath()
	// Only a local navigation route can be used as the retry destination.
	if !strings.HasPrefix(retryPath, "/go/") {
		retryPath = "/"
	} else {
		retryPath += "?retry=1"
	}
	fallback := fmt.Sprintf(`<main><h1>%s</h1><p>暂时无法连接到目标站点，请稍后重试。</p><a href="%s">重试访问</a> <a href="/">返回导航</a></main>`, htmlEscape(message), htmlEscape(retryPath))
	root := fmt.Sprintf(`<div id="root" data-navigation-error="%s" data-retry-path="%s" data-configured-theme="%s">%s</div>`, htmlEscape(message), htmlEscape(retryPath), htmlEscape(s.config.Theme), fallback)
	var contents []byte
	var err error
	if s.static != nil {
		contents, err = fs.ReadFile(s.static, "index.html")
	}
	if err == nil && bytes.Contains(contents, []byte(`<div id="root"></div>`)) {
		contents = bytes.Replace(contents, []byte(`<div id="root"></div>`), []byte(root), 1)
		_, _ = writer.Write(contents)
		return
	}
	_, _ = fmt.Fprintf(writer, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Navi</title><body>%s</body></html>`, fallback)
}

func htmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&#34;", "'", "&#39;")
	return replacer.Replace(value)
}
