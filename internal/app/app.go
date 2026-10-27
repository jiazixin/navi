// Package app composes Navi's process lifecycle.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"

	"navi/internal/catalog"
	"navi/internal/config"
	"navi/internal/favicon"
	"navi/internal/navigation"
	"navi/web"
)

// Run starts Navi and waits for context cancellation or an HTTP server failure.
// version is reported by GET /api/info. It logs service_listening once the
// port is bound and service_stopping when ctx ends; the caller logs
// service_starting, service_stopped and failures.
func Run(ctx context.Context, loaded config.Config, logger *slog.Logger, version string) (runErr error) {
	directory, err := catalog.LoadFile(ctx, loaded.Catalog.Path)
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
	listenConfig := net.ListenConfig{}
	listener, err := listenConfig.Listen(ctx, "tcp", net.JoinHostPort(loaded.Server.Listen, fmt.Sprintf("%d", loaded.Server.Port)))
	if err != nil {
		return fmt.Errorf("listen on %s:%d: %w", loaded.Server.Listen, loaded.Server.Port, err)
	}
	defer func() {
		if err := listener.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
			runErr = errors.Join(runErr, fmt.Errorf("close listener: %w", err))
		}
	}()
	var workers sync.WaitGroup
	watcher := catalog.NewWatcher(catalog.WatcherOptions{Path: loaded.Catalog.Path, Debounce: loaded.Catalog.ReloadDebounce, Load: catalog.LoadFile, Store: store, Logger: logger})
	iconStore, iconManager, iconDegraded := startFaviconManager(ctx, loaded, logger, watcher)
	var eventObserverDone chan struct{}
	defer func() {
		cancel()
		shutdownCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), loaded.Server.ShutdownTimeout)
		defer stop()
		runErr = errors.Join(runErr, watcher.Shutdown(shutdownCtx))
		if eventObserverDone != nil {
			select {
			case <-eventObserverDone:
				workers.Wait()
			case <-shutdownCtx.Done():
				runErr = errors.Join(runErr, shutdownCtx.Err())
			}
		}
		if iconManager != nil {
			runErr = errors.Join(runErr, iconManager.Shutdown(shutdownCtx))
		}
	}()

	if loaded.Catalog.Watch {
		if err := watcher.Start(runCtx); err != nil {
			return fmt.Errorf("start catalog watcher: %w", err)
		}
	}
	if iconManager != nil {
		if err := iconManager.Start(runCtx); err != nil {
			return fmt.Errorf("start favicon manager: %w", err)
		}
	}
	eventObserverDone = observeCatalogEvents(runCtx, catalogObserverOptions{Watcher: watcher, Store: store, Manager: iconManager, Logger: logger, RefreshInterval: loaded.Favicon.RefreshInterval, Workers: &workers})
	scheduleIcons(ctx, iconManager, store, logger)

	resolver := navigation.NewResolver(
		navigation.NewProber(loaded.Navigation.MaxConcurrentProbes),
		loaded.Navigation.PrivateProbeTimeout,
		loaded.Navigation.ProbeCacheTTL,
	)
	handler, err := newHTTPServer(httpOptions{
		Config: loaded, Version: version, Catalog: store, Watcher: watcher, Icons: iconStore, Resolver: resolver, Static: static,
		Degraded: iconDegraded, Logger: logger,
	})
	if err != nil {
		return fmt.Errorf("create HTTP API: %w", err)
	}
	unused := newUnusedConnections()
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: loaded.Server.ReadHeaderTimeout, ReadTimeout: loaded.Server.ReadTimeout,
		WriteTimeout: loaded.Server.WriteTimeout, IdleTimeout: loaded.Server.IdleTimeout,
		BaseContext: func(net.Listener) context.Context { return runCtx },
		ConnState:   unused.track, MaxHeaderBytes: maxHeaderBytes,
		ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	// Shutdown runs these after closing its listeners.
	server.RegisterOnShutdown(unused.closeAll)
	serverErrors := make(chan error, 1)
	workers.Go(func() {
		serverErrors <- server.Serve(listener)
	})
	entries, groups := catalogCounts(snapshot.Catalog())
	logger.Info("service_listening",
		"listen", listener.Addr().String(),
		"config_source", loaded.Path,
		"storage", loaded.StorageDir,
		"revision", snapshot.Revision(),
		"entries", entries,
		"groups", groups,
	)

	select {
	case <-ctx.Done():
		logger.Info("service_stopping")
		// Propagate process cancellation to long-lived handlers such as SSE before
		// waiting for the HTTP server to become idle.
		cancel()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.WithoutCancel(ctx), loaded.Server.ShutdownTimeout)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown HTTP server: %w", errors.Join(err, server.Close()))
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

// maxHeaderBytes bounds request headers; Navi needs only a session cookie.
const maxHeaderBytes = 64 << 10

func catalogCounts(directory catalog.Catalog) (entries, groups int) {
	for _, page := range directory.Pages {
		groups += len(page.Groups)
		for _, group := range page.Groups {
			entries += len(group.Links)
		}
	}
	return entries, groups
}

// iconCacheUnavailable reports a permanently degraded icon cache with its
// status code; the UI falls back to monograms.
func iconCacheUnavailable() (bool, string) {
	return true, statusIconCacheUnavailable
}

func startFaviconManager(ctx context.Context, loaded config.Config, logger *slog.Logger, watcher *catalog.Watcher) (*favicon.Store, *favicon.Manager, func() (bool, string)) {
	store, err := favicon.NewStore(ctx, loaded.StorageDir)
	if err != nil {
		logger.Error("favicon_cache_unavailable", "error", err)
		return nil, nil, iconCacheUnavailable
	}
	manager, err := favicon.NewManager(favicon.Config{
		FetchTimeout: loaded.Favicon.FetchTimeout, RefreshInterval: loaded.Favicon.RefreshInterval,
		MaxFileBytes: loaded.Favicon.MaxFileBytes, Workers: loaded.Favicon.Workers,
	}, store, watcher.Publish)
	if err != nil {
		logger.Error("favicon_manager_unavailable", "error", err)
		return store, nil, iconCacheUnavailable
	}
	return store, manager, manager.Degraded
}

// scheduleIcons queues icon work for the current snapshot.
func scheduleIcons(ctx context.Context, manager *favicon.Manager, store *catalog.Store, logger *slog.Logger) {
	if manager == nil {
		return
	}
	snapshot, ok := store.Snapshot()
	if !ok {
		return
	}
	if err := manager.Schedule(ctx, snapshot.Catalog()); err != nil {
		logger.Error("favicon_maintenance_failed", "error", err)
	}
}

type catalogObserverOptions struct {
	Watcher         *catalog.Watcher
	Store           *catalog.Store
	Manager         *favicon.Manager
	Logger          *slog.Logger
	RefreshInterval time.Duration
	Workers         *sync.WaitGroup
}

func observeCatalogEvents(ctx context.Context, options catalogObserverOptions) chan struct{} {
	watcher, store, manager := options.Watcher, options.Store, options.Manager
	logger, refreshInterval := options.Logger, options.RefreshInterval
	done := make(chan struct{})
	var events <-chan catalog.Event
	closeSubscription := func() {}
	if watcher != nil {
		subscription := watcher.Subscribe()
		events = subscription.Events()
		closeSubscription = subscription.Close
	}
	options.Workers.Go(func() {
		defer close(done)
		defer closeSubscription()
		ticker := time.NewTicker(refreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				scheduleIcons(ctx, manager, store, logger)
			case event, ok := <-events:
				if !ok {
					return
				}
				if event.Type == catalog.EventStatusUpdated && manager != nil {
					degraded, code := manager.Degraded()
					if degraded {
						logger.Error("favicon_cache_degraded", "code", code)
					} else {
						logger.Info("favicon_cache_recovered")
					}
					continue
				}
				if event.Type != catalog.EventCatalogUpdated {
					continue
				}
				logger.Info("catalog_reloaded", "revision", event.Revision)
				scheduleIcons(ctx, manager, store, logger.With("revision", event.Revision))
			}
		}
	})
	return done
}
