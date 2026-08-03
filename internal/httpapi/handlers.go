package httpapi

import (
	"bytes"
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

func (s *Server) serveCatalog(writer http.ResponseWriter, request *http.Request) {
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		writeJSONError(writer, http.StatusServiceUnavailable, "目录暂时不可用。")
		return
	}
	writer.Header().Set("ETag", snapshot.ETag())
	writer.Header().Set("Cache-Control", "no-store")
	if request.Header.Get("If-None-Match") == snapshot.ETag() {
		writer.WriteHeader(http.StatusNotModified)
		return
	}
	writeJSON(writer, http.StatusOK, s.catalogResponse(snapshot))
}

func (s *Server) catalogResponse(snapshot *catalog.Snapshot) catalogResponse {
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

func (s *Server) serveStatus(writer http.ResponseWriter, request *http.Request) {
	health, revision, message := s.status()
	status := http.StatusOK
	if health == "unavailable" {
		status = http.StatusServiceUnavailable
	}
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, status, statusResponse{Health: health, Revision: revision, Message: message})
}

func (s *Server) serveHealth(writer http.ResponseWriter, request *http.Request) {
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

func (s *Server) serveEvents(writer http.ResponseWriter, request *http.Request) {
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
	controller := http.NewResponseController(writer)
	if err := controller.SetWriteDeadline(time.Time{}); err != nil && !errors.Is(err, http.ErrNotSupported) {
		return
	}
	if err := controller.Flush(); err != nil {
		return
	}

	heartbeat := time.NewTicker(s.heartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-request.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(writer, "event: %s\ndata: %s\n\n", event.Type, payload); err != nil {
				return
			}
			if err := controller.Flush(); err != nil {
				return
			}
		case <-heartbeat.C:
			if _, err := fmt.Fprint(writer, ": heartbeat\n\n"); err != nil {
				return
			}
			if err := controller.Flush(); err != nil {
				return
			}
		}
	}
}

func (s *Server) serveIcon(writer http.ResponseWriter, request *http.Request) {
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
	writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
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

func (s *Server) serveGo(writer http.ResponseWriter, request *http.Request) {
	if s.resolver == nil {
		writeFailurePage(writer, http.StatusServiceUnavailable, "链接暂时不可用")
		return
	}
	runtimeID := strings.TrimPrefix(request.URL.Path, "/go/")
	snapshot, ok := s.catalog.Snapshot()
	if !ok {
		writeFailurePage(writer, http.StatusServiceUnavailable, "目录暂时不可用")
		return
	}
	link, ok := snapshot.Catalog().FindLink(runtimeID)
	if !ok {
		writeFailurePage(writer, http.StatusNotFound, "链接不存在")
		return
	}
	target, err := s.resolver.Resolve(request.Context(), link)
	if errors.Is(err, navigation.ErrUnreachable) {
		writeFailurePage(writer, http.StatusBadGateway, link.Name+" 当前无法访问")
		return
	}
	if err != nil {
		writeFailurePage(writer, http.StatusServiceUnavailable, "链接暂时不可用")
		return
	}
	writer.Header().Set("Cache-Control", "no-store")
	http.Redirect(writer, request, target, http.StatusFound)
}

func (s *Server) serveStatic(writer http.ResponseWriter, request *http.Request) {
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
	writer.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(writer, request, "index.html", time.Time{}, bytes.NewReader(contents))
}

func (s *Server) status() (string, uint64, string) {
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

func writeFailurePage(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.WriteHeader(status)
	if _, err := fmt.Fprintf(writer, "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>Navi</title><body><main><h1>%s</h1><p>请返回导航页后重试。</p></main></body></html>", htmlEscape(message)); err != nil {
		return
	}
}

func htmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&#34;", "'", "&#39;")
	return replacer.Replace(value)
}
