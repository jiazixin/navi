import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, onUnauthenticated } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api', () => {
  it('returns the JSON body and sends JSON writes', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{"value":1}', { status: 200 })))
    await expect(api<{ value: number }>('/thing')).resolves.toEqual({ value: 1 })
    await api('/thing', { method: 'POST', body: { name: 'a' } })
    const [, read] = spy.mock.calls[0] ?? []
    const [, write] = spy.mock.calls[1] ?? []
    expect(read?.headers).not.toHaveProperty('Content-Type')
    expect(write?.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect(write?.body).toBe('{"name":"a"}')
  })

  it('reads the error envelope, request ID and Retry-After', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"rate_limited","message":"too many attempts"}}', {
        status: 429,
        headers: { 'X-Request-ID': 'req-1', 'Retry-After': '3' },
      }),
    )
    const error: unknown = await api('/auth/login', { method: 'POST', body: {} }).catch(
      (failure: unknown) => failure,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 429,
      code: 'rate_limited',
      requestId: 'req-1',
      retryAfterMs: 3000,
      message: 'too many attempts',
    })
  })

  it('maps network failures to network_unavailable and keeps aborts native', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    spy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api('/catalog')).rejects.toMatchObject({ status: 0, code: 'network_unavailable' })
    spy.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(api('/catalog')).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('notifies listeners of an expired session but not of rejected credentials', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthenticated(listener)
    const spy = vi.spyOn(globalThis, 'fetch')
    spy.mockResolvedValueOnce(
      new Response('{"error":{"code":"invalid_credentials","message":"x"}}', { status: 401 }),
    )
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(listener).not.toHaveBeenCalled()
    spy.mockResolvedValueOnce(
      new Response('{"error":{"code":"unauthenticated","message":"x"}}', { status: 401 }),
    )
    await expect(api('/catalog')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})

describe('api cancellation and timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('aborts the request when the caller cancels', async () => {
    let requestSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      requestSignal = init?.signal ?? undefined
      return Promise.resolve(new Response('{}'))
    })
    const controller = new AbortController()
    await api('/status', { signal: controller.signal })
    controller.abort()
    expect(requestSignal?.aborted).toBe(true)
  })

  it('maps a timed-out request to the timeout code', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('timed out', 'TimeoutError')),
    )
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    await expect(api('/status')).rejects.toMatchObject({ status: 0, code: 'timeout' })
  })
})

it('does not follow authenticated redirects', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
  await api<unknown>('/status')
  expect(request).toHaveBeenCalledWith(
    '/api/status',
    expect.objectContaining({ redirect: 'error' }),
  )
})

it('rejects oversized responses even without Content-Length', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify('x'.repeat(8 * 1024 * 1024 + 1)), {
      headers: { 'X-Request-ID': 'large-response' },
    }),
  )
  await expect(api<unknown>('/catalog')).rejects.toMatchObject({
    code: 'invalid_response',
    requestId: 'large-response',
  })
})
