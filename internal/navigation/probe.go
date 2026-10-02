// Package navigation resolves validated Navi links without forwarding client credentials.
package navigation

import (
	"context"
	"errors"
	"maps"
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
	canceled  bool
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
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	for {
		if ctx.Err() != nil {
			return false
		}
		now := time.Now()
		p.cacheMu.Lock()
		maps.DeleteFunc(p.cache, func(_ string, cached probeResult) bool {
			return !now.Before(cached.expiresAt)
		})
		if cached, ok := p.cache[target]; ok {
			p.cacheMu.Unlock()
			return cached.reachable
		}
		if ongoing, ok := p.flights[target]; ok {
			p.cacheMu.Unlock()
			select {
			case <-ctx.Done():
				return false
			case <-ongoing.done:
				// One caller's cancellation is not evidence about the target.
				// Retry within this caller's original budget when the leader stopped.
				if ongoing.canceled {
					continue
				}
				return ongoing.reachable
			}
		}
		ongoing := &flight{done: make(chan struct{})}
		p.flights[target] = ongoing
		p.cacheMu.Unlock()

		reachable := p.probe(ctx, target)
		p.cacheMu.Lock()
		ongoing.reachable = reachable
		ongoing.canceled = ctx.Err() != nil
		if !ongoing.canceled {
			p.cache[target] = probeResult{reachable: reachable, expiresAt: time.Now().Add(cacheTTL)}
		}
		delete(p.flights, target)
		close(ongoing.done)
		p.cacheMu.Unlock()
		return reachable
	}
}

func (p *Prober) probe(ctx context.Context, target string) bool {
	select {
	case p.limit <- struct{}{}:
		defer func() { <-p.limit }()
	case <-ctx.Done():
		return false
	}

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
	if len(via) > 3 {
		return errors.New("redirect limit reached")
	}
	return nil
}
