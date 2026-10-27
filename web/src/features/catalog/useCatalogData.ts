import { useQuery } from '@tanstack/react-query'
import { getCatalog } from '../../app/api/catalog'

/** Public keys for catalog cache updates. */
export const catalogKeys = {
  all: ['catalog'] as const,
  snapshot: () => ['catalog', 'snapshot'] as const,
}

/** Reads the current catalog; SSE invalidates this snapshot. */
export function useCatalogData() {
  return useQuery({ queryKey: catalogKeys.snapshot(), queryFn: ({ signal }) => getCatalog(signal) })
}
