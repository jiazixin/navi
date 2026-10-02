package navigation

import (
	"context"
	"errors"
	"time"

	"navi/internal/catalog"
)

// ErrUnreachable indicates that no configured destination can be reached.
var ErrUnreachable = errors.New("no configured destination is reachable")

// Resolver selects private destinations first and public destinations as fallback.
type Resolver struct {
	prober         *Prober
	privateTimeout time.Duration
	publicTimeout  time.Duration
	cacheTTL       time.Duration
}

// NewResolver creates a private-first resolver.
func NewResolver(prober *Prober, privateTimeout, publicTimeout, cacheTTL time.Duration) *Resolver {
	return &Resolver{
		prober: prober, privateTimeout: privateTimeout, publicTimeout: publicTimeout, cacheTTL: cacheTTL,
	}
}

// Resolve chooses a reachable destination for one immutable catalog link.
func (r *Resolver) Resolve(ctx context.Context, link catalog.Link) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if link.PrivateURL != "" && r.prober.Probe(ctx, link.PrivateURL, r.privateTimeout, r.cacheTTL) {
		return link.PrivateURL, nil
	}
	if link.PublicURL != "" && r.prober.Probe(ctx, link.PublicURL, r.publicTimeout, r.cacheTTL) {
		return link.PublicURL, nil
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return "", ErrUnreachable
}

// Retry discards only negative cached results before a user-requested retry.
// Successful probes and in-flight request deduplication remain intact.
func (r *Resolver) Retry(ctx context.Context, link catalog.Link) (string, error) {
	r.prober.cacheMu.Lock()
	for _, target := range []string{link.PrivateURL, link.PublicURL} {
		if cached, ok := r.prober.cache[target]; ok && !cached.reachable {
			delete(r.prober.cache, target)
		}
	}
	r.prober.cacheMu.Unlock()
	return r.Resolve(ctx, link)
}
