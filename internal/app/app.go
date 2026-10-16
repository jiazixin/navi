// Package app composes Navi's process lifecycle.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
	"navi/internal/favicon"
	"navi/internal/navigation"
	"navi/web"
)

// Run starts Navi and waits for context cancellation or an HTTP server failure.
func Run(ctx context.Context, loaded config.Config, logger *slog.Logger) error {
	if logger == nil {
		logger = slog.Default()
	}
	directory, err := catalog.LoadFile(loaded.Catalog.Path)
	if err != nil {
		return fmt.Errorf("load initial catalog: %w", err)
	}
	store := catalog.NewStore()
	snapshot := store.Publish(directory)
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	static, err := web.Files()
	if err != nil {
		return fmt.Errorf("open embedded UI: %w", err)
	}
	watcher := catalog.NewWatcher(loaded.Catalog.Path, loaded.Catalog.ReloadDebounce, catalog.LoadFile, store)
	var eventObserverDone chan struct{}
	if loaded.Catalog.Watch {
		if err := watcher.Start(runCtx); err != nil {
			logger.Error("catalog watcher unavailable", "error", err)
			return fmt.Errorf("start catalog watcher: %w", err)
		}
	}
	iconStore, iconManager, iconDegraded := startFaviconManager(loaded, logger, watcher)
	if iconManager != nil {
		iconManager.Start(runCtx)
	}
	eventObserverDone = observeCatalogEvents(runCtx, watcher, store, iconManager, logger, loaded.Favicon.RefreshInterval)
	if iconManager != nil {
		if err := iconManager.Schedule(snapshot.Catalog()); err != nil {
			logger.Error("favicon cache maintenance failed", "error", err)
		}
	}
	defer func() {
		cancel()
		if watcher != nil {
			watcher.Stop()
		}
		if eventObserverDone != nil {
			<-eventObserverDone
		}
		if iconManager != nil {
			iconManager.Stop()
		}
	}()

	resolver := navigation.NewResolver(
		navigation.NewProber(loaded.Navigation.MaxConcurrentProbes),
		loaded.Navigation.PrivateProbeTimeout,
		loaded.Navigation.PublicProbeTimeout,
		loaded.Navigation.ProbeCacheTTL,
	)
	handler, err := newHTTPServer(httpOptions{
		Config: loaded, Catalog: store, Watcher: watcher, Icons: iconStore, Resolver: resolver, Static: static,
		Degraded: iconDegraded, Logger: logger,
	})
	if err != nil {
		return fmt.Errorf("create HTTP API: %w", err)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort(loaded.Server.Listen, fmt.Sprintf("%d", loaded.Server.Port)))
	if err != nil {
		return fmt.Errorf("listen on %s:%d: %w", loaded.Server.Listen, loaded.Server.Port, err)
	}
	unused := newUnusedConnections()
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: loaded.Server.ReadHeaderTimeout, ReadTimeout: loaded.Server.ReadTimeout,
		WriteTimeout: loaded.Server.WriteTimeout, IdleTimeout: loaded.Server.IdleTimeout,
		BaseContext: func(net.Listener) context.Context { return runCtx },
		ConnState:   unused.track,
	}
	// Shutdown runs these after closing its listeners.
	server.RegisterOnShutdown(unused.closeAll)
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()
	entries, groups := catalogCounts(snapshot.Catalog())
	logger.Info("Navi started",
		"listen", listener.Addr().String(),
		"config_source", loaded.Path,
		"storage", loaded.StorageDir,
		"revision", snapshot.Revision(),
		"entries", entries,
		"groups", groups,
	)

	select {
	case <-ctx.Done():
		// Propagate process cancellation to long-lived handlers such as SSE before
		// waiting for the HTTP server to become idle.
		cancel()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), loaded.Server.ShutdownTimeout)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return fmt.Errorf("shutdown HTTP server: %w", err)
		}
		if err := <-serverErrors; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP: %w", err)
		}
		return nil
	case err := <-serverErrors:
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve HTTP: %w", err)
	}
}

func catalogCounts(directory catalog.Catalog) (entries, groups int) {
	for _, page := range directory.Pages {
		groups += len(page.Groups)
		for _, group := range page.Groups {
			entries += len(group.Links)
		}
	}
	return entries, groups
}

func startFaviconManager(loaded config.Config, logger *slog.Logger, watcher *catalog.Watcher) (*favicon.Store, *favicon.Manager, func() (bool, string)) {
	store, err := favicon.NewStore(loaded.StorageDir)
	if err != nil {
		logger.Error("favicon cache unavailable", "error", err)
		return nil, nil, func() (bool, string) {
			return true, "图标缓存暂不可用，当前使用字标。"
		}
	}
	publish := func(event catalog.Event) {}
	if watcher != nil {
		publish = watcher.Publish
	}
	manager, err := favicon.NewManager(favicon.Config{
		FetchTimeout: loaded.Favicon.FetchTimeout, RefreshInterval: loaded.Favicon.RefreshInterval,
		MaxFileBytes: loaded.Favicon.MaxFileBytes, Workers: loaded.Favicon.Workers,
	}, store, publish)
	if err != nil {
		logger.Error("favicon manager unavailable", "error", err)
		return store, nil, func() (bool, string) {
			return true, "图标缓存暂不可用，当前使用字标。"
		}
	}
	return store, manager, manager.Degraded
}

func observeCatalogEvents(ctx context.Context, watcher *catalog.Watcher, store *catalog.Store, manager *favicon.Manager, logger *slog.Logger, refreshInterval time.Duration) chan struct{} {
	done := make(chan struct{})
	var events <-chan catalog.Event
	closeSubscription := func() {}
	if watcher != nil {
		subscription := watcher.Subscribe()
		events = subscription.Events()
		closeSubscription = subscription.Close
	}
	go func() {
		defer close(done)
		defer closeSubscription()
		ticker := time.NewTicker(refreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if manager != nil {
					if snapshot, ok := store.Snapshot(); ok {
						if err := manager.Schedule(snapshot.Catalog()); err != nil {
							logger.Error("favicon cache maintenance failed", "error", err)
						}
					}
				}
			case event, ok := <-events:
				if !ok {
					return
				}
				if event.Type == catalog.EventStatusUpdated && manager != nil {
					degraded, message := manager.Degraded()
					if degraded {
						logger.Error("favicon cache degraded", "message", message)
					} else {
						logger.Info("favicon cache recovered")
					}
					continue
				}
				if event.Type == catalog.EventCatalogError {
					logger.Error("catalog reload failed", "revision", event.Revision, "message", event.Message)
					continue
				}
				if event.Type != catalog.EventCatalogUpdated {
					continue
				}
				logger.Info("catalog reloaded", "revision", event.Revision)
				if manager != nil {
					if snapshot, ok := store.Snapshot(); ok {
						if err := manager.Schedule(snapshot.Catalog()); err != nil {
							logger.Error("favicon cache maintenance failed", "revision", event.Revision, "error", err)
						}
					}
				}
			}
		}
	}()
	return done
}
