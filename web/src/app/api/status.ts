import { z } from './schema'
import { api } from '../api'

export const serviceStatusSchema = z.object({
  // An unknown health value from a newer server is treated as degraded.
  health: z.enum(['ok', 'degraded', 'unavailable']).catch('degraded'),
  revision: z.number().int().nonnegative(),
  code: z.string().max(64).optional(),
  message: z.string().max(240).optional(),
})

type ServiceStatus = z.infer<typeof serviceStatusSchema>

export async function getServiceStatus(signal?: AbortSignal): Promise<ServiceStatus> {
  return await api<ServiceStatus>('/status', { signal, schema: serviceStatusSchema })
}
