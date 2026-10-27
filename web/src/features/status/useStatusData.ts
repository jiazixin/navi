import { useQuery } from '@tanstack/react-query'
import { getServiceStatus } from '../../app/api/status'

/** Public keys for service health updates. */
export const statusKeys = { all: ['status'] as const, health: () => ['status', 'health'] as const }

/** Reads the current service status. */
export function useStatusData() {
  return useQuery({
    queryKey: statusKeys.health(),
    queryFn: ({ signal }) => getServiceStatus(signal),
  })
}
