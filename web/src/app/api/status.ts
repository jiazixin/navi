import { z } from './schema';
import { fetchJSON } from './client';

export const serviceStatusSchema = z
  .object({
    health: z.enum(['ok', 'degraded', 'unavailable']),
    revision: z.number().int().nonnegative(),
    message: z.string().max(240).optional(),
  })
  .strict();

type ServiceStatus = z.infer<typeof serviceStatusSchema>;

const statusFailures = {
  http: '无法读取服务状态。',
  unreadable: '服务状态数据无效。',
  invalid: '服务状态数据无效。',
};

export function getServiceStatus(signal?: AbortSignal): Promise<ServiceStatus> {
  return fetchJSON('/api/status', serviceStatusSchema, statusFailures, signal);
}
