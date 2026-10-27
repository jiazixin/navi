package catalog

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// EventType identifies catalog changes announced to subscribers.
type EventType string

const (
	// EventCatalogUpdated announces a successfully published catalog snapshot.
	EventCatalogUpdated EventType = "catalog_updated"
	// EventCatalogError announces a reload failure while the old snapshot remains active.
	EventCatalogError EventType = "catalog_error"
	// EventStatusUpdated requests a fresh service health read.
	EventStatusUpdated EventType = "status_updated"

	// EventFaviconUpdated announces that a local favicon cache entry is available.
	EventFaviconUpdated EventType = "favicon_updated"
)

// Status codes of the catalog. The cause of a reload failure is only logged.
const (
	StatusUnavailable  = "catalog_unavailable"
	StatusReloadFailed = "catalog_reload_failed"
)

// Event is a compact catalog reload notification suitable for SSE delivery.
type Event struct {
	Type      EventType `json:"type"`
	Revision  uint64    `json:"revision,omitzero"`
	Code      string    `json:"code,omitzero"`
	RuntimeID string    `json:"runtime_id,omitzero"`
}

// Loader validates a catalog file and returns a fully constructed catalog.
type Loader func(context.Context, string) (Catalog, error)

// Watcher reloads its catalog after file changes and publishes nonblocking events.
// mu guards lifecycle and degradation fields; eventHub guards its subscriptions.
type Watcher struct {
	path      string
	directory string
	debounce  time.Duration
	load      Loader
	store     *Store
	logger    *slog.Logger
	events    *eventHub

	mu         sync.RWMutex
	watcher    *fsnotify.Watcher
	started    bool
	stopped    bool
	degraded   bool
	statusCode string

	stopOnce sync.Once
	done     chan struct{}
	wg       sync.WaitGroup
}

// Subscription owns one nonblocking catalog event stream.
type Subscription struct {
	events <-chan Event
	close  func()
}

// Events returns the subscription's event stream.
func (s Subscription) Events() <-chan Event {
	return s.events
}

// Close stops the subscription and releases its event channel.
func (s Subscription) Close() {
	s.close()
}

// WatcherOptions supplies the dependencies of a catalog watcher.
type WatcherOptions struct {
	Path     string
	Debounce time.Duration
	Load     Loader
	Store    *Store
	Logger   *slog.Logger
}

// NewWatcher constructs a watcher; call Start before Shutdown.
func NewWatcher(options WatcherOptions) *Watcher {
	return &Watcher{
		path:      filepath.Clean(options.Path),
		directory: filepath.Dir(options.Path),
		debounce:  options.Debounce,
		load:      options.Load,
		store:     options.Store,
		logger:    options.Logger,
		events:    newEventHub(),
		done:      make(chan struct{}),
	}
}

// Start begins watching the catalog parent directory until Shutdown or context cancellation.
func (w *Watcher) Start(ctx context.Context) error {
	if w.load == nil {
		return errors.New("catalog watcher requires a loader")
	}
	if w.store == nil {
		return errors.New("catalog watcher requires a store")
	}
	if w.debounce <= 0 {
		return errors.New("catalog watcher debounce must be greater than zero")
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("create catalog watcher: %w", err)
	}
	if err := watcher.Add(w.directory); err != nil {
		watcher.Close() // fsnotify Close is idempotent cleanup; worker completion is awaited.
		return fmt.Errorf("watch catalog directory: %w", err)
	}
	w.mu.Lock()
	if w.watcher != nil {
		w.mu.Unlock()
		watcher.Close() // fsnotify Close is idempotent cleanup; worker completion is awaited.
		return errors.New("catalog watcher is already running")
	}
	if w.stopped {
		w.mu.Unlock()
		watcher.Close() // fsnotify Close is idempotent cleanup; worker completion is awaited.
		return errors.New("catalog watcher has been stopped")
	}
	w.watcher = watcher
	w.started = true
	w.mu.Unlock()

	w.wg.Go(func() { w.run(ctx, watcher) })
	return nil
}

// Shutdown releases watcher resources and waits within the caller deadline.
func (w *Watcher) Shutdown(ctx context.Context) error {
	w.stopOnce.Do(func() {
		w.mu.Lock()
		watcher := w.watcher
		started := w.started
		w.stopped = true
		if !started {
			w.events.Close()
			close(w.done)
		}
		w.mu.Unlock()
		if watcher != nil {
			_ = watcher.Close() // fsnotify Close is idempotent cleanup; worker completion is awaited.
		}
	})
	select {
	case <-w.done:
		w.wg.Wait()
		return nil
	case <-ctx.Done():
		return fmt.Errorf("shutdown catalog watcher: %w", ctx.Err())
	}
}

// Subscribe creates an event stream that retains only the newest pending event.
func (w *Watcher) Subscribe() Subscription {
	return w.events.Subscribe()
}

// Publish forwards a nonblocking event to current watcher subscribers.
func (w *Watcher) Publish(event Event) {
	w.events.Publish(event)
}

// Degraded reports whether the most recent reload attempt failed, with its
// status code.
func (w *Watcher) Degraded() (bool, string) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.degraded, w.statusCode
}

func (w *Watcher) run(ctx context.Context, watcher *fsnotify.Watcher) {
	defer close(w.done)
	defer w.events.Close()

	var timer *time.Timer
	var timerChannel <-chan time.Time
	defer func() {
		if timer != nil {
			timer.Stop()
		}
	}()

	for {
		select {
		case <-ctx.Done():
			_ = watcher.Close() // fsnotify Close is idempotent cleanup; worker completion is awaited.
			return
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			w.recordFailure(fmt.Errorf("watch catalog directory: %w", err))
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if filepath.Clean(event.Name) != w.path {
				continue
			}
			timer, timerChannel = resetTimer(timer, w.debounce)
		case <-timerChannel:
			timer = nil
			timerChannel = nil
			w.reload(ctx)
		}
	}
}

func (w *Watcher) reload(ctx context.Context) {
	loaded, err := w.load(ctx, w.path)
	if err != nil {
		w.recordFailure(err)
		return
	}
	snapshot := w.store.Publish(loaded)
	w.mu.Lock()
	w.degraded = false
	w.statusCode = ""
	w.mu.Unlock()
	w.events.Publish(Event{Type: EventCatalogUpdated, Revision: snapshot.Revision()})
}

func (w *Watcher) recordFailure(err error) {
	w.mu.Lock()
	w.degraded = true
	w.statusCode = StatusReloadFailed
	w.mu.Unlock()
	revision := uint64(0)
	if snapshot, ok := w.store.Snapshot(); ok {
		revision = snapshot.Revision()
	}
	w.logger.Error("catalog_reload_failed", "path", w.path, "revision", revision, "error", err)
	w.events.Publish(Event{Type: EventCatalogError, Revision: revision, Code: StatusReloadFailed})
}

func resetTimer(timer *time.Timer, duration time.Duration) (*time.Timer, <-chan time.Time) {
	if timer == nil {
		timer = time.NewTimer(duration)
	} else {
		timer.Reset(duration)
	}
	return timer, timer.C
}

const maxEventSubscribers = 4096

// eventHub.mu protects all subscriber and lifecycle state.
type eventHub struct {
	mu     sync.Mutex
	nextID uint64
	subs   map[uint64]chan Event
	closed bool
}

func newEventHub() *eventHub {
	return &eventHub{subs: make(map[uint64]chan Event)}
}

func (h *eventHub) Subscribe() Subscription {
	h.mu.Lock()
	defer h.mu.Unlock()
	channel := make(chan Event, 1)
	if h.closed || len(h.subs) >= maxEventSubscribers {
		close(channel)
		return Subscription{events: channel, close: func() {}}
	}
	id := h.nextID
	h.nextID++
	h.subs[id] = channel
	return Subscription{
		events: channel,
		close: func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			if subscriber, ok := h.subs[id]; ok {
				delete(h.subs, id)
				close(subscriber)
			}
		},
	}
}

func (h *eventHub) Publish(event Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, subscriber := range h.subs {
		select {
		case subscriber <- event:
		default:
			select {
			case <-subscriber:
			default:
			}
			// Multiple event types can displace one another. Ask consumers to
			// reconcile the complete snapshot rather than lose a catalog update.
			select {
			case subscriber <- Event{Type: EventCatalogUpdated, Revision: event.Revision}:
			default:
			}
		}
	}
}

func (h *eventHub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	for id, subscriber := range h.subs {
		delete(h.subs, id)
		close(subscriber)
	}
}
