// Package navigation resolves validated Navi links without forwarding client credentials.
package navigation

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"
)

// Prober determines whether a destination is reachable from the Navi host.
type Prober struct {
	cacheMu sync.Mutex
	cache   map[string]probeResult
	flights map[string]*flight
	limit   chan struct{}
}

type probeResult struct {
	reachable bool
	expiresAt time.Time
}

type flight struct {
	done      chan struct{}
	reachable bool
}

// NewProber creates a bounded, cached destination prober.
func NewProber(maxConcurrent int) *Prober {
	return &Prober{
		cache: make(map[string]probeResult), flights: make(map[string]*flight),
		limit: make(chan struct{}, maxConcurrent),
	}
}

// Probe checks a target once per cache period, combining simultaneous callers.
func (p *Prober) Probe(ctx context.Context, target string, timeout, cacheTTL time.Duration) bool {
	now := time.Now()
	p.cacheMu.Lock()
	if cached, ok := p.cache[target]; ok && now.Before(cached.expiresAt) {
		p.cacheMu.Unlock()
		return cached.reachable
	}
	if ongoing, ok := p.flights[target]; ok {
		p.cacheMu.Unlock()
		select {
		case <-ctx.Done():
			return false
		case <-ongoing.done:
			return ongoing.reachable
		}
	}
	ongoing := &flight{done: make(chan struct{})}
	p.flights[target] = ongoing
	p.cacheMu.Unlock()

	reachable := p.probe(ctx, target, timeout)
	p.cacheMu.Lock()
	ongoing.reachable = reachable
	p.cache[target] = probeResult{reachable: reachable, expiresAt: time.Now().Add(cacheTTL)}
	delete(p.flights, target)
	close(ongoing.done)
	p.cacheMu.Unlock()
	return reachable
}

func (p *Prober) probe(parent context.Context, target string, timeout time.Duration) bool {
	select {
	case p.limit <- struct{}{}:
		defer func() { <-p.limit }()
	case <-parent.Done():
		return false
	}

	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	client := &http.Client{CheckRedirect: limitRedirects}
	response, err := request(ctx, client, http.MethodHead, target)
	if response != nil {
		response.Body.Close()
	}
	if err != nil {
		return false
	}
	if response.StatusCode != http.StatusMethodNotAllowed && response.StatusCode != http.StatusNotImplemented {
		return reachableStatus(response.StatusCode)
	}
	response, err = request(ctx, client, http.MethodGet, target)
	if response != nil {
		response.Body.Close()
	}
	return err == nil && reachableStatus(response.StatusCode)
}

func request(ctx context.Context, client *http.Client, method, target string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, method, target, nil)
	if err != nil {
		return nil, err
	}
	if method == http.MethodGet {
		request.Header.Set("Range", "bytes=0-0")
	}
	return client.Do(request)
}

func reachableStatus(status int) bool {
	return status >= 100 && status < 500
}

func limitRedirects(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("redirect limit reached")
	}
	return nil
}
