// Package navigation resolves validated Navi links without forwarding client credentials.
package navigation

import (
	"context"
	"crypto/tls"
	"errors"
	"maps"
	"net/http"
	"sync"
	"time"
)

const maxProbeEntries = 4096
const maxProbeRedirects = 3

// Prober determines whether a destination is reachable from the Navi host.
// cacheMu guards cache and flights; a completed flight is published by closing done.
type Prober struct {
	now       func() time.Time
	transport http.RoundTripper
	cacheMu   sync.Mutex
	cache     map[string]probeResult
	flights   map[string]*flight
	limit     chan struct{}
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
		limit: make(chan struct{}, min(256, max(1, maxConcurrent))), now: time.Now, transport: http.DefaultTransport,
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
		now := p.now()
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
		if len(p.flights) >= maxProbeEntries {
			p.cacheMu.Unlock()
			return false
		}
		ongoing := &flight{done: make(chan struct{})}
		p.flights[target] = ongoing
		p.cacheMu.Unlock()

		reachable := p.probe(ctx, target)
		p.cacheMu.Lock()
		ongoing.reachable = reachable
		ongoing.canceled = ctx.Err() != nil
		if !ongoing.canceled && len(p.cache) < maxProbeEntries {
			p.cache[target] = probeResult{reachable: reachable, expiresAt: p.now().Add(cacheTTL)}
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

	client := &http.Client{CheckRedirect: limitRedirects, Transport: p.transport}
	status, err := requestStatus(ctx, client, http.MethodHead, target)
	if err == nil && (status == http.StatusMethodNotAllowed || status == http.StatusNotImplemented) {
		status, err = requestStatus(ctx, client, http.MethodGet, target)
	}
	if err != nil {
		return completedHandshake(err)
	}
	return reachableStatus(status)
}

// completedHandshake reports a TLS peer whose certificate this host cannot verify.
// Private services often use self-signed or internal-CA certificates; the host is
// reachable, and the browser applies its own trust decision after the redirect.
func completedHandshake(err error) bool {
	_, ok := errors.AsType[*tls.CertificateVerificationError](err)
	return ok
}

// requestStatus sends one probe request and returns its status code; GET asks
// for a single byte so a reachable page is not downloaded.
func requestStatus(ctx context.Context, client *http.Client, method, target string) (int, error) {
	request, err := http.NewRequestWithContext(ctx, method, target, nil)
	if err != nil {
		return 0, err
	}
	if request.URL.User != nil {
		return 0, errors.New("probe URL must not contain credentials")
	}
	if method == http.MethodGet {
		request.Header.Set("Range", "bytes=0-0")
	}
	response, err := client.Do(request)
	if err != nil {
		return 0, err
	}
	_ = response.Body.Close() // The probe only needs headers; discarded bodies are not persisted.
	return response.StatusCode, nil
}

func reachableStatus(status int) bool {
	return status >= 100 && status < 500
}

func limitRedirects(request *http.Request, via []*http.Request) error {
	if request != nil && (request.URL.User != nil || request.Header.Get("Authorization") != "" || request.Header.Get("Cookie") != "") {
		return http.ErrUseLastResponse
	}
	if len(via) > maxProbeRedirects {
		return errors.New("redirect limit reached")
	}
	return nil
}
