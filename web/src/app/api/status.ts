import { z } from './schema';
import { APIError } from './catalog';

export const serviceStatusSchema = z
  .object({
    health: z.enum(['ok', 'degraded', 'unavailable']),
    revision: z.number().int().nonnegative(),
    message: z.string().max(240).optional(),
  })
  .strict();

type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export async function getServiceStatus(signal?: AbortSignal): Promise<ServiceStatus> {
  const requestInit: RequestInit = {
    headers: { Accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  };
  const response = await fetch('/api/status', requestInit);

  if (!response.ok) {
    throw new APIError('无法读取服务状态。', response.status);
  }

  const payload: unknown = await response.json();
  const result = serviceStatusSchema.safeParse(payload);
  if (!result.success) {
    throw new APIError('服务状态数据无效。', response.status, { cause: result.error });
  }

  return result.data;
}
