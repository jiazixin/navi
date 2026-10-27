import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSession, login } from './auth'

describe('session verification', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('accepts only a confirmed server session and bypasses cached responses', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"authenticated":true,"auth_required":true}'))
    const signal = new AbortController().signal
    await expect(getSession(signal)).resolves.toEqual({ authenticated: true, auth_required: true })
    expect(spy).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
        cache: 'no-store',
      }),
    )
  })
  it('accepts explicitly disabled authentication', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"authenticated":true,"auth_required":false}'),
    )
    await expect(getSession()).resolves.toEqual({ authenticated: true, auth_required: false })
  })
  it('distinguishes an expired session from outages and malformed responses', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    spy.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(getSession()).resolves.toEqual({ authenticated: false, auth_required: true })
    spy.mockResolvedValueOnce(new Response('', { status: 503 }))
    await expect(getSession()).rejects.toThrow()
    spy.mockResolvedValueOnce(new Response('{"authenticated":"true"}'))
    await expect(getSession()).rejects.toThrow()
    spy.mockResolvedValueOnce(new Response('{"authenticated":true}'))
    await expect(getSession()).rejects.toThrow()
  })

  it('validates the session response returned by login', async () => {
    const request = vi.spyOn(globalThis, 'fetch')
    request.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(login('tester', 'password')).rejects.toMatchObject({ code: 'invalid_response' })
    request.mockResolvedValueOnce(new Response('{"authenticated":true,"auth_required":true}'))
    await expect(login('tester', 'password')).resolves.toBeUndefined()
  })
})
