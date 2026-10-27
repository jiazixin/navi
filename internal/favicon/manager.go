package favicon

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
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

const (
	cacheCleanupGrace = 24 * time.Hour
	// maxQueuedFetches bounds pending work; links that do not fit wait for the next schedule.
	maxQueuedFetches = 1_000
	// maintenanceFailureKey records cache cleanup failures next to per-link storage failures.
	maintenanceFailureKey = "maintenance"
)

// Manager fetches icons in bounded background workers.
// mu guards lifecycle, inFlight and storageFailures; discoverMu and fetchMu guard their call maps.
type Manager struct {
	now     func() time.Time
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
	done            chan struct{}
	started         bool
	remaining       int

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
func (r iconFetchResult) clone() iconFetchResult {
	r.contents = bytes.Clone(r.contents)
	return r
}

type iconCall struct {
	done   chan struct{}
	result iconFetchResult
	err    error
}

// NewManager creates a favicon manager around a writable cache store.
func NewManager(config Config, store *Store, publish func(catalog.Event)) (*Manager, error) {
	if store == nil {
		return nil, errors.New("favicon manager requires a cache store")
	}
	if config.FetchTimeout <= 0 || config.RefreshInterval <= 0 || config.MaxFileBytes <= 0 || config.Workers < 1 || config.Workers > 16 || config.MaxFileBytes > maxCachedIconBytes {
		return nil, errors.New("favicon manager has invalid configuration")
	}
	client := &http.Client{Timeout: config.FetchTimeout, CheckRedirect: limitRedirects}
	return &Manager{
		config: config, store: store, client: client, publish: publish, now: time.Now,
		storageFailures: make(map[string]bool), inFlight: make(map[string]struct{}), jobs: make(chan catalog.Link, maxQueuedFetches),
		discovering: make(map[string]*discoverCall), fetching: make(map[string]*iconCall),
	}, nil
}

// Start launches the configured number of bounded fetching workers.
func (m *Manager) Start(parent context.Context) error {
	m.mu.Lock()
	if m.started {
		m.mu.Unlock()
		return errors.New("favicon manager already started")
	}
	ctx, cancel := context.WithCancel(parent)
	m.cancel = cancel
	m.started = true
	m.done = make(chan struct{})
	m.remaining = m.config.Workers
	for range m.config.Workers {
		m.wg.Go(func() {
			defer func() {
				m.mu.Lock()
				defer m.mu.Unlock()
				m.remaining--
				if m.remaining == 0 {
					close(m.done)
				}
			}()
			m.worker(ctx)
		})
	}
	m.mu.Unlock()
	return nil
}

// Shutdown cancels workers and waits within the caller deadline.
func (m *Manager) Shutdown(ctx context.Context) error {
	m.mu.Lock()
	cancel, done := m.cancel, m.done
	m.mu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	select {
	case <-done:
		m.wg.Wait()
		return nil
	case <-ctx.Done():
		return fmt.Errorf("shutdown favicon manager: %w", ctx.Err())
	}
}

// Schedule queues missing or expired icons and retires cache entries that are
// no longer referenced by the active catalog.
func (m *Manager) Schedule(ctx context.Context, directory catalog.Catalog) error {
	activeRuntimeIDs := make(map[string]struct{})
	for _, page := range directory.Pages {
		for _, group := range page.Groups {
			for _, link := range group.Links {
				activeRuntimeIDs[link.RuntimeID] = struct{}{}
				if !m.shouldFetch(ctx, link.RuntimeID) {
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
	_, err := m.store.Cleanup(ctx, activeRuntimeIDs, cacheCleanupGrace)
	m.recordStorageResult(maintenanceFailureKey, err)
	if err != nil {
		return fmt.Errorf("cleanup favicon cache: %w", err)
	}
	return nil
}

func (m *Manager) shouldFetch(ctx context.Context, runtimeID string) bool {
	m.mu.Lock()
	failed := m.storageFailures[runtimeID]
	m.mu.Unlock()
	if entry, ok := m.store.Entry(ctx, runtimeID); ok && !failed && m.now().Sub(entry.FetchedAt) < m.config.RefreshInterval {
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
	entry, hasEntry := m.store.Entry(ctx, link.RuntimeID)
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
				_, refreshErr := m.store.Refresh(ctx, RefreshRequest{RuntimeID: link.RuntimeID, SourceURL: candidate, SourceETag: result.sourceETag, LastModified: result.lastModified})
				if !errors.Is(refreshErr, ErrNotFound) {
					m.recordStorageResult(link.RuntimeID, refreshErr)
					return
				}
				// The blob may have been deleted while the conditional request was
				// in progress. Recover its bytes instead of extending empty metadata.
				result, err = m.fetchIconSingleflight(ctx, candidate, Entry{})
				if err != nil {
					continue
				}
			}
			_, err = m.store.Put(ctx, WriteRequest{RuntimeID: link.RuntimeID, SourceURL: candidate, ContentType: result.contentType, SourceETag: result.sourceETag, LastModified: result.lastModified, Body: result.contents})
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
	if err != nil || parsed.User != nil || len(source) > 4096 || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return iconFetchResult{}, errors.New("invalid favicon source")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return iconFetchResult{}, fmt.Errorf("create favicon request: %w", err)
	}
	request.Header.Set("Accept", "image/webp,image/png,image/svg+xml,image/jpeg,image/gif,image/x-icon,image/vnd.microsoft.icon,image/*;q=0.8,*/*;q=0.5")
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
	defer response.Body.Close() // Unread remote bytes are discarded; validated data was read explicitly.
	sourceETag := response.Header.Get("ETag")
	lastModified := response.Header.Get("Last-Modified")
	if response.StatusCode == http.StatusNotModified {
		if previous.SourceURL != source || (previous.SourceETag == "" && previous.LastModified == "") {
			return iconFetchResult{}, errors.New("fetch favicon: unexpected not-modified response")
		}
		return iconFetchResult{sourceETag: sourceETag, lastModified: lastModified, notModified: true}, nil
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return iconFetchResult{}, errors.New("fetch favicon: unexpected status")
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, m.config.MaxFileBytes+1))
	if err != nil {
		return iconFetchResult{}, fmt.Errorf("read favicon: %w", err)
	}
	if int64(len(contents)) > m.config.MaxFileBytes {
		return iconFetchResult{}, errors.New("read favicon: file exceeds size limit")
	}
	contentType, ok := validatedContentType(response.Header.Get("Content-Type"), contents)
	if !ok {
		return iconFetchResult{}, errors.New("read favicon: unsupported image type")
	}
	return iconFetchResult{
		contentType:  contentType,
		contents:     contents,
		sourceETag:   sourceETag,
		lastModified: lastModified,
	}, nil
}

func limitRedirects(request *http.Request, via []*http.Request) error {
	if request != nil && (request.URL.User != nil || request.Header.Get("Authorization") != "" || request.Header.Get("Cookie") != "") {
		return http.ErrUseLastResponse
	}
	if len(via) > 3 {
		return errors.New("favicon redirect limit reached")
	}
	return nil
}

// StatusWriteFailed is the status code of failing icon cache writes.
const StatusWriteFailed = "icon_cache_write_failed"

// Degraded reports local persistence failures with their status code; remote
// sites without icons do not degrade Navi.
func (m *Manager) Degraded() (bool, string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.storageFailures) > 0 {
		return true, StatusWriteFailed
	}
	return false, ""
}

func (m *Manager) recordStorageResult(key string, err error) {
	m.updateStorageFailures(func(failures map[string]bool) {
		if err != nil {
			failures[key] = true
		} else {
			delete(failures, key)
		}
	})
}

func (m *Manager) pruneStorageFailures(active map[string]struct{}) {
	m.updateStorageFailures(func(failures map[string]bool) {
		for key := range failures {
			if _, ok := active[key]; !ok && key != maintenanceFailureKey {
				delete(failures, key)
			}
		}
	})
}

// updateStorageFailures applies update under the lock and announces a status
// change when the manager enters or leaves the degraded state.
func (m *Manager) updateStorageFailures(update func(failures map[string]bool)) {
	m.mu.Lock()
	wasDegraded := len(m.storageFailures) > 0
	update(m.storageFailures)
	changed := wasDegraded != (len(m.storageFailures) > 0)
	m.mu.Unlock()
	if changed && m.publish != nil {
		m.publish(catalog.Event{Type: catalog.EventStatusUpdated})
	}
}
