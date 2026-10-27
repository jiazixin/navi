import { ApiError, api } from '../api'
import { z } from './schema'

const sessionSchema = z.object({ authenticated: z.literal(true), auth_required: z.boolean() })

export async function getSession(
  signal?: AbortSignal,
): Promise<{ authenticated: boolean; auth_required: boolean }> {
  try {
    return await api<{ authenticated: boolean; auth_required: boolean }>('/auth/session', {
      signal,
      schema: sessionSchema,
    })
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      return { authenticated: false, auth_required: true }
    }
    throw error
  }
}

/** Signs in; a rejected login throws an ApiError with the server's code. */
export async function login(
  username: FormDataEntryValue | null,
  password: FormDataEntryValue | null,
  signal?: AbortSignal,
): Promise<void> {
  await api<undefined>('/auth/login', { method: 'POST', body: { username, password }, signal })
}

/** Signs out; rejects when the server did not end the session. */
export async function logout(signal?: AbortSignal): Promise<void> {
  await api<undefined>('/auth/logout', { method: 'POST', signal })
}
