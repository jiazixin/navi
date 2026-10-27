import { afterEach, describe, expect, it, vi } from 'vitest'
import { getServiceStatus, serviceStatusSchema } from './status'

describe('service status API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decodes all documented health states', () => {
    for (const health of ['ok', 'degraded', 'unavailable'] as const) {
      expect(serviceStatusSchema.parse({ health, revision: 2 })).toEqual({ health, revision: 2 })
    }
  })

  it('loads status with an optional abort signal', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ health: 'ok', revision: 1 }), { status: 200 }),
      )
    const controller = new AbortController()

    await expect(getServiceStatus(controller.signal)).resolves.toEqual({
      health: 'ok',
      revision: 1,
    })
    // The request signal combines the caller's cancel with the timeout.
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/status',
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    )
  })

  it('rejects HTTP and schema errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(getServiceStatus()).rejects.toMatchObject({ status: 500 })

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ health: 'unknown' }), { status: 200 }),
    )
    await expect(getServiceStatus()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
