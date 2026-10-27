import { useEffect, useState } from 'react'
import { isRetryable, retryDelayMs } from '../../app/queryClient'
import { ApiError, openEventStream, type EventStream } from '../../app/api'

export type ConnectionState =
  { kind: 'connecting' } | { kind: 'live' } | { kind: 'reconnecting'; attempt: number }

type UseCatalogEventsOptions = {
  onCatalogUpdate: () => void
  /** A reload failed or service health changed; re-read /api/status. */
  onStatusChange: () => void
  onFaviconUpdate?: (runtime_id: string) => void
}

export function useCatalogEvents({
  onCatalogUpdate,
  onStatusChange,
  onFaviconUpdate,
}: UseCatalogEventsOptions): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'connecting' })

  useEffect(() => {
    let source: EventStream | undefined
    let reconnectTimer: number | undefined
    let attempt = 0
    let isDisposed = false

    function connect(): void {
      if (isDisposed) return

      source = openEventStream()
      source.addEventListener('open', () => {
        // Opening headers do not prove the stream will stay alive. Only an
        // explicit retry starts a new budget, including after repeated short streams.
        setConnection({ kind: 'live' })
        // Reconcile changes missed before subscription or during disconnection.
        onCatalogUpdate()
      })
      source.addEventListener('catalog_updated', onCatalogUpdate)
      source.addEventListener('favicon_updated', (event) => {
        const runtimeId = parseFaviconRuntimeId(event)
        if (runtimeId !== undefined && onFaviconUpdate !== undefined) {
          onFaviconUpdate(runtimeId)
          return
        }
        onCatalogUpdate()
      })
      source.addEventListener('catalog_error', onStatusChange)
      source.addEventListener('status_updated', onStatusChange)
      source.addEventListener('error', (event) => {
        source?.close()
        attempt += 1
        setConnection({ kind: 'reconnecting', attempt })
        const failure: unknown =
          event instanceof CustomEvent
            ? event.detail
            : new ApiError('stream disconnected', {
                status: 0,
                code: 'network_unavailable',
                requestId: '',
              })
        if (attempt <= 2 && isRetryable(failure))
          reconnectTimer = window.setTimeout(connect, retryDelayMs(attempt - 1, failure))
      })
    }

    const retry = () => {
      if (attempt === 0 || isDisposed) return
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      source?.close()
      attempt = 0
      connect()
    }
    window.addEventListener('online', retry)
    window.addEventListener('navi:retry-events', retry)
    connect()
    return () => {
      window.removeEventListener('online', retry)
      window.removeEventListener('navi:retry-events', retry)
      isDisposed = true
      source?.close()
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer)
      }
    }
  }, [onCatalogUpdate, onFaviconUpdate, onStatusChange])

  return connection
}

function parseFaviconRuntimeId(event: Event): string | undefined {
  if (
    !(event instanceof MessageEvent) ||
    typeof event.data !== 'string' ||
    event.data.length > 16_384
  )
    return undefined
  try {
    const payload: unknown = JSON.parse(event.data)
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'runtime_id' in payload &&
      typeof payload.runtime_id === 'string' &&
      payload.runtime_id.length > 0 &&
      payload.runtime_id.length <= 256
    ) {
      return payload.runtime_id
    }
  } catch {
    // Reconcile the complete catalog when an event cannot identify one icon.
  }
  return undefined
}
