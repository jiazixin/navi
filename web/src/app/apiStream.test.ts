import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, onUnauthenticated, openEventStream } from './api'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('bounded event subscriptions', () => {
  it('decodes split frames and refuses redirects with the shared request policy', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: favicon.updated\r\ndata: {"runtime_'))
        controller.enqueue(encoder.encode('id":"icon"}\r\n\r\n: heartbeat\n\n'))
        controller.close()
      },
    })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    const stream = openEventStream()
    const listener = vi.fn()
    stream.addEventListener('favicon.updated', listener)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    const event: unknown = listener.mock.calls[0]?.[0]
    expect(event).toBeInstanceOf(MessageEvent)
    if (event instanceof MessageEvent) expect(event.data).toBe('{"runtime_id":"icon"}')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      headers: { Accept: 'text/event-stream' },
    })
    stream.close()
  })

  it('bounds incomplete events and releases the response reader', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(16_385)))
      },
      cancel,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    )
    const stream = openEventStream()
    const listener = vi.fn()
    stream.addEventListener('error', listener)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    expect(cancel).toHaveBeenCalledOnce()
    const event: unknown = listener.mock.calls[0]?.[0]
    if (!(event instanceof CustomEvent)) throw new Error('Expected a stream failure event')
    expect(event.detail).toBeInstanceOf(ApiError)
    stream.close()
  })

  it('notifies the shared session handler on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
    const listener = vi.fn()
    const unsubscribe = onUnauthenticated(listener)
    const stream = openEventStream()
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    stream.close()
    unsubscribe()
  })

  it('reports an idle timeout, but suppresses errors after explicit close', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Canceled', 'AbortError')),
            { once: true },
          )
        }),
    )
    const first = openEventStream()
    const listener = vi.fn()
    first.addEventListener('error', listener)
    await vi.advanceTimersByTimeAsync(45_000)
    expect(listener).toHaveBeenCalledOnce()
    first.close()
    const second = openEventStream()
    second.addEventListener('error', listener)
    second.close()
    await vi.advanceTimersByTimeAsync(45_000)
    expect(listener).toHaveBeenCalledOnce()
  })
})
