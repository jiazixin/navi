package catalog

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// EventType identifies catalog changes announced to subscribers.
type EventType string

const (
	// EventCatalogUpdated announces a successfully published catalog snapshot.
	EventCatalogUpdated EventType = "catalog.updated"
	// EventCatalogError announces a reload failure while the old snapshot remains active.
	EventCatalogError EventType = "catalog.error"
	// EventFaviconUpdated announces that a local favicon cache entry is available.
	EventFaviconUpdated EventType = "favicon.updated"
)

// Event is a compact catalog reload notification suitable for SSE delivery.
type Event struct {
	Type     EventType
	Revision uint64
	Message  string
}

// Loader validates a catalog file and returns a fully constructed catalog.
type Loader func(string) (Catalog, error)

// Watcher reloads its catalog after file changes and publishes nonblocking events.
type Watcher struct {
	path      string
	directory string
	debounce  time.Duration
	load      Loader
	store     *Store
	events    *eventHub

	mu       sync.RWMutex
	watcher  *fsnotify.Watcher
	degraded bool
	message  string

	stopOnce sync.Once
	done     chan struct{}
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

// NewWatcher creates a file watcher for one catalog path.
func NewWatcher(path string, debounce time.Duration, load Loader, store *Store) *Watcher {
	return &Watcher{
		path:      filepath.Clean(path),
		directory: filepath.Dir(path),
		debounce:  debounce,
		load:      load,
		store:     store,
		events:    newEventHub(),
		done:      make(chan struct{}),
	}
}

// Start begins watching the catalog parent directory until Stop or context cancellation.
func (w *Watcher) Start(ctx context.Context) error {
	if w.load == nil {
		return fmt.Errorf("catalog watcher requires a loader")
	}
	if w.store == nil {
		return fmt.Errorf("catalog watcher requires a store")
	}
	if w.debounce <= 0 {
		return fmt.Errorf("catalog watcher debounce must be greater than zero")
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("create catalog watcher: %w", err)
	}
	if err := watcher.Add(w.directory); err != nil {
		watcher.Close()
		return fmt.Errorf("watch catalog directory: %w", err)
	}
	w.mu.Lock()
	if w.watcher != nil {
		w.mu.Unlock()
		watcher.Close()
		return fmt.Errorf("catalog watcher is already running")
	}
	w.watcher = watcher
	w.mu.Unlock()

	go w.run(ctx, watcher)
	return nil
}

// Stop releases watcher resources and waits for its worker to exit.
func (w *Watcher) Stop() {
	w.stopOnce.Do(func() {
		w.mu.RLock()
		watcher := w.watcher
		w.mu.RUnlock()
		if watcher != nil {
			_ = watcher.Close()
		}
	})
	<-w.done
}

// Subscribe creates an event stream that retains only the newest pending event.
func (w *Watcher) Subscribe() Subscription {
	return w.events.Subscribe()
}

// Publish forwards a nonblocking event to current watcher subscribers.
func (w *Watcher) Publish(event Event) {
	w.events.Publish(event)
}

// Degraded reports whether the most recent reload attempt failed.
func (w *Watcher) Degraded() (bool, string) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.degraded, w.message
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
			_ = watcher.Close()
			return
		case _, ok := <-watcher.Errors:
			if !ok {
				return
			}
			w.recordFailure()
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
			w.reload()
		}
	}
}

func (w *Watcher) reload() {
	loaded, err := w.load(w.path)
	if err != nil {
		w.recordFailure()
		return
	}
	snapshot := w.store.Publish(loaded)
	w.mu.Lock()
	w.degraded = false
	w.message = ""
	w.mu.Unlock()
	w.events.Publish(Event{Type: EventCatalogUpdated, Revision: snapshot.Revision()})
}

func (w *Watcher) recordFailure() {
	w.mu.Lock()
	w.degraded = true
	w.message = "目录更新失败，当前仍显示最近一次有效内容。"
	w.mu.Unlock()
	revision := uint64(0)
	if snapshot, ok := w.store.Snapshot(); ok {
		revision = snapshot.Revision()
	}
	w.events.Publish(Event{Type: EventCatalogError, Revision: revision, Message: "目录更新失败，当前仍显示最近一次有效内容。"})
}

func resetTimer(timer *time.Timer, duration time.Duration) (*time.Timer, <-chan time.Time) {
	if timer == nil {
		timer = time.NewTimer(duration)
		return timer, timer.C
	}
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(duration)
	return timer, timer.C
}

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
	if h.closed {
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
			select {
			case subscriber <- event:
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
