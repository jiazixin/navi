import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { isRetryable, retryDelayMs } from './queryClient'

function failure(status: number, code = '', retryAfterMs?: number): ApiError {
  return new ApiError('failed', { status, code, requestId: '', retryAfterMs })
}

describe('query retry rules', () => {
  it('retries only network failures, timeouts, 429 and 503', () => {
    expect(isRetryable(failure(0, 'network_unavailable'))).toBe(true)
    expect(isRetryable(failure(0, 'timeout'))).toBe(true)
    expect(isRetryable(failure(429))).toBe(true)
    expect(isRetryable(failure(503))).toBe(true)
    expect(isRetryable(failure(500))).toBe(false)
    expect(isRetryable(failure(0, 'invalid_response'))).toBe(false)
    expect(isRetryable(new Error('boom'))).toBe(false)
  })

  it('gives up when Retry-After exceeds ten seconds and otherwise waits for it', () => {
    expect(isRetryable(failure(503, '', 10_001))).toBe(false)
    expect(retryDelayMs(0, failure(503, '', 2000))).toBe(2000)
  })

  it('backs off from 500 ms with at most 20% jitter, capped at ten seconds', () => {
    const first = retryDelayMs(0, failure(503))
    expect(first).toBeGreaterThanOrEqual(500)
    expect(first).toBeLessThanOrEqual(600)
    expect(retryDelayMs(10, failure(503))).toBe(10_000)
  })
})
