package navigation

import (
	"context"
	"time"

	"navi/internal/catalog"
)

// Resolver selects the private destination when it is reachable and the public one otherwise.
type Resolver struct {
	prober         *Prober
	privateTimeout time.Duration
	cacheTTL       time.Duration
}

// NewResolver creates a private-first resolver.
func NewResolver(prober *Prober, privateTimeout, cacheTTL time.Duration) *Resolver {
	return &Resolver{prober: prober, privateTimeout: privateTimeout, cacheTTL: cacheTTL}
}

// Resolve chooses the destination for one immutable catalog link.
// A link with a single URL is returned without probing; only the private URL
// of a link with both is probed, and the public URL is used when it fails.
func (r *Resolver) Resolve(ctx context.Context, link catalog.Link) string {
	if link.PrivateURL == "" {
		return link.PublicURL
	}
	if link.PublicURL == "" || r.prober.Probe(ctx, link.PrivateURL, r.privateTimeout, r.cacheTTL) {
		return link.PrivateURL
	}
	return link.PublicURL
}
