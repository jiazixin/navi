package favicon

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"slices"
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

	mu              sync.Mutex
	inFlight        map[string]struct{}
	storageFailures map[string]bool
	jobs            chan catalog.Link
	cancel          context.CancelFunc
	wg              sync.WaitGroup

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

type iconFetchResult struct {
	contentType  string
	contents     []byte
	sourceETag   string
	lastModified string
	notModified  bool
}

// clone gives each waiter ownership of its image bytes.
func (result iconFetchResult) clone() iconFetchResult {
	result.contents = bytes.Clone(result.contents)
	return result
}

type iconCall struct {
	done   chan struct{}
	result iconFetchResult
	err    error
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
		storageFailures: make(map[string]bool), inFlight: make(map[string]struct{}), jobs: make(chan catalog.Link, 1_000),
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
	for range m.config.Workers {
		m.wg.Go(func() { m.worker(ctx) })
	}
	m.mu.Unlock()
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
	m.pruneStorageFailures(activeRuntimeIDs)
	_, err := m.store.Cleanup(activeRuntimeIDs, cacheCleanupGrace)
	m.recordStorageResult("maintenance", err)
	if err != nil {
		return fmt.Errorf("cleanup favicon cache: %w", err)
	}
	return nil
}

func (m *Manager) shouldFetch(runtimeID string) bool {
	m.mu.Lock()
	failed := m.storageFailures[runtimeID]
	m.mu.Unlock()
	if entry, ok := m.store.Entry(runtimeID); ok && !failed && time.Since(entry.FetchedAt) < m.config.RefreshInterval {
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
			result, err := m.fetchIconSingleflight(ctx, candidate, previous)
			if err != nil {
				continue
			}
			if result.notModified {
				_, refreshErr := m.store.Refresh(link.RuntimeID, candidate, result.sourceETag, result.lastModified)
				m.recordStorageResult(link.RuntimeID, refreshErr)
				return
			}
			_, err = m.store.PutWithValidators(link.RuntimeID, candidate, result.contentType, result.sourceETag, result.lastModified, result.contents)
			m.recordStorageResult(link.RuntimeID, err)
			if err != nil {
				return
			}
			if m.publish != nil {
				m.publish(catalog.Event{Type: catalog.EventFaviconUpdated, RuntimeID: link.RuntimeID})
			}
			return
		}
	}
}

func (m *Manager) fetchIconSingleflight(ctx context.Context, source string, previous Entry) (iconFetchResult, error) {
	key := source + "\x00" + previous.SourceETag + "\x00" + previous.LastModified
	m.fetchMu.Lock()
	if call, ok := m.fetching[key]; ok {
		m.fetchMu.Unlock()
		select {
		case <-call.done:
			return call.result.clone(), call.err
		case <-ctx.Done():
			return iconFetchResult{}, ctx.Err()
		}
	}
	call := &iconCall{done: make(chan struct{})}
	m.fetching[key] = call
	m.fetchMu.Unlock()

	call.result, call.err = m.fetchIcon(ctx, source, previous)
	m.fetchMu.Lock()
	delete(m.fetching, key)
	close(call.done)
	m.fetchMu.Unlock()
	return call.result.clone(), call.err
}

func (m *Manager) discover(ctx context.Context, pageURL string) ([]string, error) {
	m.discoverMu.Lock()
	if call, ok := m.discovering[pageURL]; ok {
		m.discoverMu.Unlock()
		select {
		case <-call.done:
			return slices.Clone(call.candidates), call.err
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
	return slices.Clone(call.candidates), call.err
}

func (m *Manager) fetchIcon(ctx context.Context, source string, previous Entry) (iconFetchResult, error) {
	parsed, err := url.Parse(source)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return iconFetchResult{}, fmt.Errorf("invalid favicon source")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return iconFetchResult{}, fmt.Errorf("create favicon request: %w", err)
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
		return iconFetchResult{}, fmt.Errorf("fetch favicon: %w", err)
	}
	defer response.Body.Close()
	sourceETag := response.Header.Get("ETag")
	lastModified := response.Header.Get("Last-Modified")
	if response.StatusCode == http.StatusNotModified {
		return iconFetchResult{sourceETag: sourceETag, lastModified: lastModified, notModified: true}, nil
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return iconFetchResult{}, fmt.Errorf("fetch favicon: unexpected status")
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, m.config.MaxFileBytes+1))
	if err != nil {
		return iconFetchResult{}, fmt.Errorf("read favicon: %w", err)
	}
	if int64(len(contents)) > m.config.MaxFileBytes {
		return iconFetchResult{}, fmt.Errorf("read favicon: file exceeds size limit")
	}
	contentType, ok := validatedContentType(response.Header.Get("Content-Type"), contents)
	if !ok {
		return iconFetchResult{}, fmt.Errorf("read favicon: unsupported image type")
	}
	return iconFetchResult{
		contentType:  contentType,
		contents:     contents,
		sourceETag:   sourceETag,
		lastModified: lastModified,
	}, nil
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
	if len(via) > 3 {
		return errors.New("favicon redirect limit reached")
	}
	return nil
}

// Degraded reports local persistence failures; remote sites without icons do not degrade Navi.
func (m *Manager) Degraded() (bool, string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.storageFailures) > 0 {
		return true, "图标缓存写入失败，当前保留已有图标或使用字标。请检查存储权限和磁盘空间。"
	}
	return false, ""
}

func (m *Manager) recordStorageResult(key string, err error) {
	m.mu.Lock()
	wasDegraded := len(m.storageFailures) > 0
	if err != nil {
		m.storageFailures[key] = true
	} else {
		delete(m.storageFailures, key)
	}
	changed := wasDegraded != (len(m.storageFailures) > 0)
	m.mu.Unlock()
	if changed && m.publish != nil {
		m.publish(catalog.Event{Type: catalog.EventStatusUpdated})
	}
}

func (m *Manager) pruneStorageFailures(active map[string]struct{}) {
	m.mu.Lock()
	wasDegraded := len(m.storageFailures) > 0
	for key := range m.storageFailures {
		if _, ok := active[key]; !ok && key != "maintenance" {
			delete(m.storageFailures, key)
		}
	}
	changed := wasDegraded != (len(m.storageFailures) > 0)
	m.mu.Unlock()
	if changed && m.publish != nil {
		m.publish(catalog.Event{Type: catalog.EventStatusUpdated})
	}
}
