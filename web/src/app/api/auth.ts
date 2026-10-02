import { z } from './schema';

const sessionSchema = z.object({ authenticated: z.literal(true), authRequired: z.boolean() }).strict();

export async function getSession(signal?: AbortSignal): Promise<{ authenticated: boolean; authRequired: boolean }> {
  const response = await fetch('/api/auth/session', {
    cache: 'no-store', ...(signal === undefined ? {} : { signal }),
  });
  if (response.status === 401) return { authenticated: false, authRequired: true };
  if (!response.ok) throw new Error('无法连接到服务');
  const body: unknown = await response.json();
  return sessionSchema.parse(body);
}
