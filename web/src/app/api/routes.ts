/** Server routes the UI links to; the server probes private/public addresses behind /go/. */
export function navigationHref(runtimeId: string): string {
  return `/go/${encodeURIComponent(runtimeId)}`
}

/** Server-cached favicon; a new version makes mounted images reload after favicon_updated. */
export function iconSource(runtimeId: string, version?: number): string {
  return `/api/icons/${encodeURIComponent(runtimeId)}${version === undefined ? '' : `?v=${version}`}`
}
