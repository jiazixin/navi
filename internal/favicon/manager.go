package favicon

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"navi/internal/catalog"
)

// Config configures favicon fetching work.
type Config struct {
	FetchTimeout    time.Duration
	RefreshInterval time.Duration
	MaxFileBytes    int64
	Workers         int
}

// Manager fetches icons in bounded background workers.
type Manager struct {
	config  Config
	store   *Store
	client  *http.Client
	publish func(catalog.Event)

	mu       sync.Mutex
	inFlight map[string]struct{}
	jobs     chan catalog.Link
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

// NewManager creates a favicon manager around a writable cache store.
func NewManager(config Config, store *Store, publish func(catalog.Event)) (*Manager, error) {
	if store == nil {
		return nil, fmt.Errorf("favicon manager requires a cache store")
	}
	if config.FetchTimeout <= 0 || config.RefreshInterval <= 0 || config.MaxFileBytes <= 0 || config.Workers < 1 {
		return nil, fmt.Errorf("favicon manager has invalid configuration")
	}
	client := &http.Client{Timeout: config.FetchTimeout, CheckRedirect: limitRedirects}
	return &Manager{
		config: config, store: store, client: client, publish: publish,
		inFlight: make(map[string]struct{}), jobs: make(chan catalog.Link, 1_000),
	}, nil
}

// Start launches the configured number of bounded fetching workers.
func (m *Manager) Start(parent context.Context) {
	m.mu.Lock()
	if m.cancel != nil {
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	m.cancel = cancel
	m.mu.Unlock()
	for range m.config.Workers {
		m.wg.Add(1)
		go m.worker(ctx)
	}
}

// Stop cancels workers and waits for all owned work to exit.
func (m *Manager) Stop() {
	m.mu.Lock()
	cancel := m.cancel
	m.cancel = nil
	m.mu.Unlock()
	if cancel != nil {
		cancel()
		m.wg.Wait()
	}
}

// Schedule queues missing or expired icons without blocking catalog serving.
func (m *Manager) Schedule(directory catalog.Catalog) {
	for _, page := range directory.Pages {
		for _, group := range page.Groups {
			for _, link := range group.Links {
				if !m.shouldFetch(link.RuntimeID) {
					continue
				}
				select {
				case m.jobs <- link:
				default:
					m.clearInFlight(link.RuntimeID)
				}
			}
		}
	}
}

func (m *Manager) shouldFetch(runtimeID string) bool {
	if entry, ok := m.store.Entry(runtimeID); ok && time.Since(entry.FetchedAt) < m.config.RefreshInterval {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel == nil {
		return false
	}
	if _, ok := m.inFlight[runtimeID]; ok {
		return false
	}
	m.inFlight[runtimeID] = struct{}{}
	return true
}

func (m *Manager) clearInFlight(runtimeID string) {
	m.mu.Lock()
	delete(m.inFlight, runtimeID)
	m.mu.Unlock()
}

func (m *Manager) worker(ctx context.Context) {
	defer m.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case link := <-m.jobs:
			m.fetch(ctx, link)
			m.clearInFlight(link.RuntimeID)
		}
	}
}

func (m *Manager) fetch(ctx context.Context, link catalog.Link) {
	for _, entryURL := range []string{link.PublicURL, link.PrivateURL} {
		if entryURL == "" {
			continue
		}
		candidates, err := Discover(ctx, m.client, entryURL)
		if err != nil {
			continue
		}
		for _, candidate := range candidates {
			contentType, contents, lastModified, err := m.fetchIcon(ctx, candidate)
			if err != nil {
				continue
			}
			if _, err := m.store.Put(link.RuntimeID, candidate, contentType, lastModified, contents); err != nil {
				return
			}
			if m.publish != nil {
				m.publish(catalog.Event{Type: catalog.EventFaviconUpdated})
			}
			return
		}
	}
}

func (m *Manager) fetchIcon(ctx context.Context, source string) (string, []byte, string, error) {
	parsed, err := url.Parse(source)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", nil, "", fmt.Errorf("invalid favicon source")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return "", nil, "", fmt.Errorf("create favicon request: %w", err)
	}
	request.Header.Set("Accept", "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5")
	response, err := m.client.Do(request)
	if err != nil {
		return "", nil, "", fmt.Errorf("fetch favicon: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", nil, "", fmt.Errorf("fetch favicon: unexpected status")
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, m.config.MaxFileBytes+1))
	if err != nil {
		return "", nil, "", fmt.Errorf("read favicon: %w", err)
	}
	if int64(len(contents)) > m.config.MaxFileBytes {
		return "", nil, "", fmt.Errorf("read favicon: file exceeds size limit")
	}
	contentType, ok := validatedContentType(response.Header.Get("Content-Type"), contents)
	if !ok {
		return "", nil, "", fmt.Errorf("read favicon: unsupported image type")
	}
	return contentType, contents, response.Header.Get("Last-Modified"), nil
}

func validatedContentType(header string, contents []byte) (string, bool) {
	mediaType, _, err := mime.ParseMediaType(header)
	if err == nil && mediaType == "image/svg+xml" && isSVG(contents) {
		return "image/svg+xml", true
	}
	detected := http.DetectContentType(contents)
	switch detected {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		return detected, true
	case "image/x-icon", "image/vnd.microsoft.icon":
		return "image/x-icon", true
	}
	return "", false
}

func isSVG(contents []byte) bool {
	trimmed := strings.TrimSpace(strings.TrimPrefix(string(contents), "\ufeff"))
	return strings.HasPrefix(strings.ToLower(trimmed), "<svg") || strings.HasPrefix(strings.ToLower(trimmed), "<?xml") && strings.Contains(strings.ToLower(trimmed), "<svg")
}

func limitRedirects(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("favicon redirect limit reached")
	}
	return nil
}
