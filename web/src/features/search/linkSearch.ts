import type { CatalogLink, CatalogPage } from '../../app/api/catalog'
import { hostOf } from '../../lib/url/host'

export type SearchEntry = {
  link: CatalogLink
  group: string
  page: string
  host: string
}

export function buildSearchIndex(pages: readonly CatalogPage[]): SearchEntry[] {
  return pages.flatMap((page) =>
    page.groups.flatMap((group) =>
      group.links.map((link) => ({
        link,
        group: group.name,
        page: page.title,
        host: hostOf(link),
      })),
    ),
  )
}

/** Fuzzy fallback: the query's characters appear in order within a compact span of the text. */
function isCompactSubsequence(query: string, text: string): boolean {
  if (query.length < 2) return false
  const characters = Array.from(text)
  let position = 0
  let start = -1
  for (const [index, character] of characters.entries()) {
    if (character !== query[position]) continue
    if (position === 0) start = index
    position += 1
    if (position === query.length) return index - start < query.length * 3
  }
  return false
}

function score(entry: SearchEntry, query: string): number {
  const name = entry.link.name.toLocaleLowerCase()
  if (name === query) return 100
  if (name.startsWith(query)) return 80
  if (name.includes(query)) return 60
  if (entry.link.tags.some((tag) => tag.toLocaleLowerCase() === query)) return 50
  if (entry.host.includes(query)) return 45
  if ((entry.link.description ?? '').toLocaleLowerCase().includes(query)) return 35
  if (entry.group.toLocaleLowerCase().includes(query)) return 25
  if (entry.link.tags.some((tag) => tag.toLocaleLowerCase().includes(query))) return 20
  return isCompactSubsequence(query, name) ? 12 : 0
}

/** Ranks links across every page; ties keep catalog order. */
export function searchLinks(
  index: readonly SearchEntry[],
  query: string,
  limit: number,
): SearchEntry[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return []
  return index
    .map((entry, position) => ({ entry, position, score: score(entry, normalized) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .slice(0, limit)
    .map((result) => result.entry)
}

type HighlightParts = { before: string; match: string; after: string }

export function highlight(text: string, query: string): HighlightParts | null {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return null
  const start = text.toLocaleLowerCase().indexOf(normalized)
  if (start < 0) return null
  return {
    before: text.slice(0, start),
    match: text.slice(start, start + normalized.length),
    after: text.slice(start + normalized.length),
  }
}
