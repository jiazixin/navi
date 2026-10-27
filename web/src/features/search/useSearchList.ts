import { useMemo, useState } from 'react'
import { getNextMenuIndex, isMenuNavigationKey } from '../../lib/keyboard/menuNavigation'
import { searchLinks, type SearchEntry } from './linkSearch'

export const optionID = (listID: string, index: number): string => `${listID}-option-${index}`

export type SearchItem = { kind: 'link'; entry: SearchEntry } | { kind: 'web'; query: string }

/** Ranked link matches followed by a web-search row, with keyboard selection that resets per query. */
export function useSearchList(index: readonly SearchEntry[], query: string, limit: number) {
  // SearchResults scroll synchronization depends on a stable items array.
  const items = useMemo<SearchItem[]>(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    return [
      ...searchLinks(index, trimmed, limit).map((entry): SearchItem => ({ kind: 'link', entry })),
      { kind: 'web', query: trimmed },
    ]
  }, [index, limit, query])
  const [selection, setSelection] = useState({ query, index: 0 })
  const activeIndex =
    selection.query === query ? Math.min(selection.index, Math.max(0, items.length - 1)) : 0

  return {
    items,
    activeIndex,
    setActiveIndex: (next: number) => setSelection({ query, index: next }),
    /** Returns true when the key moved the selection. */
    handleNavigationKey(key: string): boolean {
      if (items.length === 0 || !isMenuNavigationKey(key)) return false
      setSelection({ query, index: getNextMenuIndex(key, activeIndex, items.length) })
      return true
    },
  }
}
