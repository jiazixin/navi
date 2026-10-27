import type { z } from './api/schema'

export type ApiErrorInit = {
  status: number // HTTP status; 0 for client-side failures
  code: string // server error.code, or a client code from 代码规范.md §5.3
  requestId: string // X-Request-ID; empty when unavailable
  details?: unknown
  retryAfterMs?: number | undefined // parsed Retry-After
}

/**
 * A failed request. message is English developer text; user text comes from
 * errorText in errors.ts. An aborted request stays a native AbortError.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string
  readonly details: unknown
  readonly retryAfterMs: number | undefined

  constructor(message: string, init: ApiErrorInit, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
    this.details = init.details
    this.retryAfterMs = init.retryAfterMs
  }
}

export type ApiOptions<T = unknown> = {
  schema?: z.ZodType<T>
  method?: string
  body?: unknown
  signal?: AbortSignal | undefined
  headers?: Record<string, string>
}

const unauthenticatedListeners = new Set<() => void>()

/** Runs listener whenever a request finds the session expired; returns the unsubscribe. */
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListeners.add(listener)
  return () => unauthenticatedListeners.delete(listener)
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

function envelopeError(body: unknown): { code: string; message: string; details: unknown } {
  const error: unknown =
    typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined
  if (typeof error !== 'object' || error === null)
    return { code: '', message: '', details: undefined }
  return {
    code: 'code' in error && typeof error.code === 'string' ? error.code : '',
    message: 'message' in error && typeof error.message === 'string' ? error.message : '',
    details: 'details' in error ? error.details : undefined,
  }
}

// The server's write timeout is 30 s; a request still open after this is lost.
const requestTimeoutMs = 60_000

async function send(path: string, options: ApiOptions, timeout: AbortSignal): Promise<Response> {
  const { method = 'GET', body, signal, headers = {} } = options
  try {
    return await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    })
  } catch (error: unknown) {
    throw clientFailure(error, signal, timeout)
  }
}

/** Maps a failed fetch: a caller's cancel stays a native AbortError. */
function clientFailure(error: unknown, signal: AbortSignal | undefined, timeout: AbortSignal) {
  if (signal?.aborted) return error
  if (timeout.aborted)
    return new ApiError(
      'request timed out',
      { status: 0, code: 'timeout', requestId: '' },
      { cause: error },
    )
  if (error instanceof DOMException && error.name === 'AbortError') return error
  if (error instanceof TypeError)
    return new ApiError(
      'network request failed',
      { status: 0, code: 'network_unavailable', requestId: '' },
      { cause: error },
    )
  if (error instanceof ApiError) return error
  return new ApiError(
    'request failed',
    { status: 0, code: 'network_unavailable', requestId: '' },
    { cause: error },
  )
}

/**
 * Sends a request to the Go server and returns the JSON body as T (undefined
 * for an empty body). Every failure is an ApiError.
 */
export async function api<T>(path: string, options: ApiOptions<T> = {}): Promise<T> {
  const timeout = AbortSignal.timeout(requestTimeoutMs)
  const response = await send(path, options, timeout)
  const requestId = response.headers.get('X-Request-ID') ?? ''
  let text: string
  try {
    text = await readResponse(response, requestId)
  } catch (error: unknown) {
    const failure = clientFailure(error, options.signal, timeout)
    if (failure instanceof ApiError && failure.requestId === '') {
      throw new ApiError(
        failure.message,
        { status: failure.status, code: failure.code, requestId },
        { cause: failure },
      )
    }
    throw failure
  }
  let body: unknown
  try {
    body = text === '' ? undefined : JSON.parse(text)
  } catch (error: unknown) {
    if (response.ok) {
      throw new ApiError(
        'response is not JSON',
        { status: response.status, code: 'invalid_response', requestId },
        { cause: error },
      )
    }
  }
  if (!response.ok) {
    const { code, message, details } = envelopeError(body)
    if (response.status === 401 && code !== 'invalid_credentials') {
      for (const listener of unauthenticatedListeners) listener()
    }
    throw new ApiError(message || `HTTP ${String(response.status)}`, {
      status: response.status,
      code,
      requestId,
      details,
      retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
    })
  }
  return options.schema === undefined ? (body as T) : parseResponse(options.schema, body, requestId)
}

/** Validates a response body that comes from configuration the server only relays. */
export function parseResponse<T>(schema: z.ZodType<T>, body: unknown, requestId = ''): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new ApiError(
      'response does not match the schema',
      { status: 0, code: 'invalid_response', requestId },
      { cause: result.error },
    )
  }
  return result.data
}

// The YAML catalog is limited to 2 MiB; allow JSON escaping while bounding memory.
const maxResponseBytes = 8 * 1024 * 1024

async function readResponse(response: Response, requestId: string): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const tooLarge = () =>
    new ApiError('response exceeds 8 MiB', {
      status: response.status,
      code: 'invalid_response',
      requestId,
    })
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    if (Number(response.headers.get('Content-Length')) > maxResponseBytes) throw tooLarge()
    for (;;) {
      const { done: isDone, value } = await reader.read()
      if (isDone) return text + decoder.decode()
      size += value.byteLength
      if (size > maxResponseBytes) throw tooLarge()
      text += decoder.decode(value, { stream: true })
    }
  } catch (error: unknown) {
    // Cancellation errors do not replace the original size/network failure.
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

const streamIdleMs = 45_000
const maxEventCharacters = 16_384

/** A bounded same-origin event subscription; close cancels the underlying request. */
export type EventStream = Pick<EventTarget, 'addEventListener'> & { close: () => void }

/** Uses the same request policy as JSON calls, including cancellation and no redirects. */
export function openEventStream(): EventStream {
  let isClosed = false
  const events = new EventTarget()
  const controller = new AbortController()
  let timer = window.setTimeout(() => controller.abort(), streamIdleMs)
  const resetDeadline = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => controller.abort(), streamIdleMs)
  }
  void readEvents(events, { signal: controller.signal, resetDeadline })
    .catch((error: unknown) => {
      if (!isClosed)
        events.dispatchEvent(
          new CustomEvent('error', { detail: clientFailure(error, undefined, controller.signal) }),
        )
    })
    .finally(() => window.clearTimeout(timer))
  return {
    addEventListener: events.addEventListener.bind(events),
    close() {
      isClosed = true
      window.clearTimeout(timer)
      controller.abort()
    },
  }
}

type StreamOptions = { signal: AbortSignal; resetDeadline: () => void }

async function readEvents(
  events: EventTarget,
  { signal, resetDeadline }: StreamOptions,
): Promise<void> {
  const response = await send(
    '/events',
    { signal, headers: { Accept: 'text/event-stream' } },
    signal,
  )
  if (signal.aborted) {
    await response.body?.cancel()
    signal.throwIfAborted()
  }
  const requestId = response.headers.get('X-Request-ID') ?? ''
  if (response.status === 401) for (const listener of unauthenticatedListeners) listener()
  if (
    !response.ok ||
    response.body === null ||
    !response.headers.get('Content-Type')?.startsWith('text/event-stream')
  ) {
    await response.body?.cancel()
    throw new ApiError('event subscription failed', {
      status: response.status,
      code: 'invalid_response',
      requestId,
      retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
    })
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let type = 'message'
  let data = ''
  let eventSize = 0
  events.dispatchEvent(new Event('open'))
  try {
    for (;;) {
      resetDeadline()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done)
        throw new ApiError('event stream ended', {
          status: 0,
          code: 'network_unavailable',
          requestId,
        })
      pending += decoder.decode(chunk.value, { stream: true })
      // A network chunk may contain many small frames; bound each unfinished frame.
      let end = pending.indexOf('\n')
      while (end >= 0) {
        const line = pending.slice(0, end).replace(/\r$/, '')
        pending = pending.slice(end + 1)
        eventSize += line.length
        if (eventSize > maxEventCharacters)
          throw new ApiError('event exceeds size limit', {
            status: 0,
            code: 'invalid_response',
            requestId,
          })
        if (line === '') {
          if (data !== '') events.dispatchEvent(new MessageEvent(type, { data: data.slice(0, -1) }))
          type = 'message'
          data = ''
          eventSize = 0
        } else if (line.startsWith('event:')) type = line.slice(6).trimStart()
        else if (line.startsWith('data:')) data += line.slice(5).trimStart() + '\n'
        end = pending.indexOf('\n')
      }
      if (pending.length + eventSize > maxEventCharacters)
        throw new ApiError('event exceeds size limit', {
          status: 0,
          code: 'invalid_response',
          requestId,
        })
    }
  } finally {
    // A canceled or invalid stream is discarded; cleanup must preserve its original failure.
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
