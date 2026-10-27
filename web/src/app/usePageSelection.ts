import { useURLString } from './urlState'
import { readStored, writeStored } from '../lib/storage/localStorage'
import type { CatalogPage } from './api/catalog'

const storageKey = 'navi.page'

/** Remembers the selected page by ID so hot reloads and reordering keep the same page. */
export function usePageSelection(pages: readonly CatalogPage[]): [number, (index: number) => void] {
  const [pageID, setPageID] = useURLString('page', readStored(storageKey) ?? '')
  const found = pages.findIndex((page) => page.id === pageID)
  const index = found >= 0 ? found : 0

  return [
    index,
    (next: number) => {
      const page = pages[next]
      if (page === undefined) return
      setPageID(page.id)
      writeStored(storageKey, page.id)
    },
  ]
}
