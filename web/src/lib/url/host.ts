type LinkAddresses = { public_url?: string | undefined; private_url?: string | undefined }

/** Display host for a link, preferring the public address; "www." is dropped. */
export function hostOf(link: LinkAddresses): string {
  const url = link.public_url ?? link.private_url
  if (url === undefined) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // A malformed optional address has no displayable host.
    return ''
  }
}
