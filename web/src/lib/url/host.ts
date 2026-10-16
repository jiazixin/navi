type LinkAddresses = { publicUrl?: string | undefined; privateUrl?: string | undefined };

/** Display host for a link, preferring the public address; "www." is dropped. */
export function hostOf(link: LinkAddresses): string {
  const url = link.publicUrl ?? link.privateUrl;
  if (url === undefined) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
