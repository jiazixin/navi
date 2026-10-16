package app

import (
	"net"
	"net/http"
	"sync"
)

// unusedConnections tracks accepted connections that have not started a request.
// Browsers pre-open spare connections; net/http's Shutdown waits up to five seconds
// before treating them as idle, which can outlast the configured shutdown timeout.
type unusedConnections struct {
	mu    sync.Mutex
	conns map[net.Conn]struct{}
}

func newUnusedConnections() *unusedConnections {
	return &unusedConnections{conns: make(map[net.Conn]struct{})}
}

// track is an http.Server ConnState hook.
func (u *unusedConnections) track(conn net.Conn, state http.ConnState) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if state == http.StateNew {
		u.conns[conn] = struct{}{}
		return
	}
	delete(u.conns, conn)
}

// closeAll closes connections that never carried a request; it runs once the
// listeners are closed, so no request is interrupted.
func (u *unusedConnections) closeAll() {
	u.mu.Lock()
	defer u.mu.Unlock()
	for conn := range u.conns {
		_ = conn.Close()
	}
	clear(u.conns)
}
