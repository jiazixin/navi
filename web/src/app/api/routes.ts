/** Server routes the UI links to; the server probes private/public addresses behind /go/. */
export function navigationHref(runtimeId: string): string {
  return `/go/${encodeURIComponent(runtimeId)}`
}

/** Cached favicon; the version busts the browser cache after a favicon.updated event. */
export function iconSource(runtimeId: string, version?: number): string {
  return `/api/icons/${encodeURIComponent(runtimeId)}${version === undefined ? '' : `?v=${version}`}`
}
