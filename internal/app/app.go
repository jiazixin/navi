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
	"navi/internal/httpapi"
	"navi/internal/navigation"
	"navi/ui"
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

	static, err := ui.Files()
	if err != nil {
		return fmt.Errorf("open embedded UI: %w", err)
	}
	var watcher *catalog.Watcher
	var eventObserverDone chan struct{}
	if loaded.Catalog.Watch {
		watcher = catalog.NewWatcher(loaded.Catalog.Path, loaded.Catalog.ReloadDebounce, catalog.LoadFile, store)
		if err := watcher.Start(runCtx); err != nil {
			return fmt.Errorf("start catalog watcher: %w", err)
		}
	}
	iconStore, iconManager, iconDegraded := startFaviconManager(loaded, logger, watcher)
	if iconManager != nil {
		iconManager.Start(runCtx)
		iconManager.Schedule(snapshot.Catalog())
		if watcher != nil {
			eventObserverDone = observeCatalogEvents(runCtx, watcher, store, iconManager)
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
	handler, err := httpapi.New(httpapi.Options{
		Config: loaded, Catalog: store, Watcher: watcher, Icons: iconStore, Resolver: resolver, Static: static,
		Degraded: iconDegraded,
	})
	if err != nil {
		return fmt.Errorf("create HTTP API: %w", err)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort(loaded.Server.Listen, fmt.Sprintf("%d", loaded.Server.Port)))
	if err != nil {
		return fmt.Errorf("listen on %s:%d: %w", loaded.Server.Listen, loaded.Server.Port, err)
	}
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: loaded.Server.ReadHeaderTimeout, ReadTimeout: loaded.Server.ReadTimeout,
		WriteTimeout: loaded.Server.WriteTimeout, IdleTimeout: loaded.Server.IdleTimeout,
	}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()
	logger.Info("Navi started", "listen", listener.Addr().String(), "config", loaded.Path, "revision", snapshot.Revision())

	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), loaded.Server.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
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

func startFaviconManager(loaded config.Config, logger *slog.Logger, watcher *catalog.Watcher) (*favicon.Store, *favicon.Manager, func() (bool, string)) {
	store, err := favicon.NewStore(loaded.DataDir)
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
	return store, manager, func() (bool, string) { return false, "" }
}

func observeCatalogEvents(ctx context.Context, watcher *catalog.Watcher, store *catalog.Store, manager *favicon.Manager) chan struct{} {
	done := make(chan struct{})
	subscription := watcher.Subscribe()
	go func() {
		defer close(done)
		defer subscription.Close()
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-subscription.Events():
				if !ok {
					return
				}
				if event.Type != catalog.EventCatalogUpdated {
					continue
				}
				if snapshot, ok := store.Snapshot(); ok {
					manager.Schedule(snapshot.Catalog())
				}
			}
		}
	}()
	return done
}

// WaitForPort waits until a TCP address can accept connections. It is used by integration tests.
func WaitForPort(ctx context.Context, address string) error {
	for {
		connection, err := net.DialTimeout("tcp", address, 50*time.Millisecond)
		if err == nil {
			if closeErr := connection.Close(); closeErr != nil {
				return fmt.Errorf("close readiness connection: %w", closeErr)
			}
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}
}
