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

const cacheCleanupGrace = 24 * time.Hour

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

	discoverMu  sync.Mutex
	discovering map[string]*discoverCall
	fetchMu     sync.Mutex
	fetching    map[string]*iconCall
}

type discoverCall struct {
	done       chan struct{}
	candidates []string
	err        error
}

type iconCall struct {
	done         chan struct{}
	contentType  string
	contents     []byte
	sourceETag   string
	lastModified string
	notModified  bool
	err          error
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
		discovering: make(map[string]*discoverCall), fetching: make(map[string]*iconCall),
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

// Schedule queues missing or expired icons and retires cache entries that are
// no longer referenced by the active catalog.
func (m *Manager) Schedule(directory catalog.Catalog) error {
	activeRuntimeIDs := make(map[string]struct{})
	for _, page := range directory.Pages {
		for _, group := range page.Groups {
			for _, link := range group.Links {
				activeRuntimeIDs[link.RuntimeID] = struct{}{}
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
	if _, err := m.store.Cleanup(activeRuntimeIDs, cacheCleanupGrace); err != nil {
		return fmt.Errorf("cleanup favicon cache: %w", err)
	}
	return nil
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
	entry, hasEntry := m.store.Entry(link.RuntimeID)
	for _, entryURL := range []string{link.PublicURL, link.PrivateURL} {
		if entryURL == "" {
			continue
		}
		candidates, err := m.discover(ctx, entryURL)
		if err != nil {
			continue
		}
		for _, candidate := range candidates {
			previous := Entry{}
			if hasEntry && entry.SourceURL == candidate {
				previous = entry
			}
			contentType, contents, sourceETag, lastModified, notModified, err := m.fetchIconSingleflight(ctx, candidate, previous)
			if err != nil {
				continue
			}
			if notModified {
				if _, refreshErr := m.store.Refresh(link.RuntimeID, candidate, sourceETag, lastModified); refreshErr == nil {
					return
				}
				continue
			}
			if _, err := m.store.PutWithValidators(link.RuntimeID, candidate, contentType, sourceETag, lastModified, contents); err != nil {
				return
			}
			if m.publish != nil {
				m.publish(catalog.Event{Type: catalog.EventFaviconUpdated, RuntimeID: link.RuntimeID})
			}
			return
		}
	}
}

func (m *Manager) fetchIconSingleflight(ctx context.Context, source string, previous Entry) (string, []byte, string, string, bool, error) {
	key := source + "\x00" + previous.SourceETag + "\x00" + previous.LastModified
	m.fetchMu.Lock()
	if call, ok := m.fetching[key]; ok {
		m.fetchMu.Unlock()
		select {
		case <-call.done:
			return call.contentType, append([]byte(nil), call.contents...), call.sourceETag, call.lastModified, call.notModified, call.err
		case <-ctx.Done():
			return "", nil, "", "", false, ctx.Err()
		}
	}
	call := &iconCall{done: make(chan struct{})}
	m.fetching[key] = call
	m.fetchMu.Unlock()

	call.contentType, call.contents, call.sourceETag, call.lastModified, call.notModified, call.err = m.fetchIcon(ctx, source, previous)
	m.fetchMu.Lock()
	delete(m.fetching, key)
	close(call.done)
	m.fetchMu.Unlock()
	return call.contentType, append([]byte(nil), call.contents...), call.sourceETag, call.lastModified, call.notModified, call.err
}

func (m *Manager) discover(ctx context.Context, pageURL string) ([]string, error) {
	m.discoverMu.Lock()
	if call, ok := m.discovering[pageURL]; ok {
		m.discoverMu.Unlock()
		select {
		case <-call.done:
			return append([]string(nil), call.candidates...), call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &discoverCall{done: make(chan struct{})}
	m.discovering[pageURL] = call
	m.discoverMu.Unlock()

	call.candidates, call.err = Discover(ctx, m.client, pageURL)
	m.discoverMu.Lock()
	delete(m.discovering, pageURL)
	close(call.done)
	m.discoverMu.Unlock()
	return append([]string(nil), call.candidates...), call.err
}

func (m *Manager) fetchIcon(ctx context.Context, source string, previous Entry) (string, []byte, string, string, bool, error) {
	parsed, err := url.Parse(source)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", nil, "", "", false, fmt.Errorf("invalid favicon source")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return "", nil, "", "", false, fmt.Errorf("create favicon request: %w", err)
	}
	request.Header.Set("Accept", "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5")
	if previous.SourceURL == source {
		if previous.SourceETag != "" {
			request.Header.Set("If-None-Match", previous.SourceETag)
		}
		if previous.LastModified != "" {
			request.Header.Set("If-Modified-Since", previous.LastModified)
		}
	}
	response, err := m.client.Do(request)
	if err != nil {
		return "", nil, "", "", false, fmt.Errorf("fetch favicon: %w", err)
	}
	defer response.Body.Close()
	sourceETag := response.Header.Get("ETag")
	lastModified := response.Header.Get("Last-Modified")
	if response.StatusCode == http.StatusNotModified {
		return "", nil, sourceETag, lastModified, true, nil
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", nil, "", "", false, fmt.Errorf("fetch favicon: unexpected status")
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, m.config.MaxFileBytes+1))
	if err != nil {
		return "", nil, "", "", false, fmt.Errorf("read favicon: %w", err)
	}
	if int64(len(contents)) > m.config.MaxFileBytes {
		return "", nil, "", "", false, fmt.Errorf("read favicon: file exceeds size limit")
	}
	contentType, ok := validatedContentType(response.Header.Get("Content-Type"), contents)
	if !ok {
		return "", nil, "", "", false, fmt.Errorf("read favicon: unsupported image type")
	}
	return contentType, contents, sourceETag, lastModified, false, nil
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
