import { useEffect, useState } from 'react';

export type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'reconnecting'; attempt: number };

type UseCatalogEventsOptions = {
  onCatalogUpdate: () => void;
  /** A reload failed or service health changed; re-read /api/status. */
  onStatusChange: () => void;
  onFaviconUpdate?: (runtimeId: string) => void;
};

export function useCatalogEvents({
  onCatalogUpdate,
  onStatusChange,
  onFaviconUpdate,
}: UseCatalogEventsOptions): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'connecting' });

  useEffect(() => {
    let source: EventSource | undefined;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    let disposed = false;

    function connect(): void {
      if (disposed) return;

      source = new EventSource('/api/events');
      source.addEventListener('open', () => {
        attempt = 0;
        setConnection({ kind: 'live' });
        // Reconcile changes missed before subscription or during disconnection.
        onCatalogUpdate();
      });
      source.addEventListener('catalog.updated', onCatalogUpdate);
      source.addEventListener('favicon.updated', (event) => {
        const runtimeId = parseFaviconRuntimeId(event);
        if (runtimeId !== undefined && onFaviconUpdate !== undefined) {
          onFaviconUpdate(runtimeId);
          return;
        }
        onCatalogUpdate();
      });
      source.addEventListener('catalog.error', onStatusChange);
      source.addEventListener('status.updated', onStatusChange);
      source.addEventListener('error', () => {
        source?.close();
        attempt += 1;
        setConnection({ kind: 'reconnecting', attempt });
        const delay = Math.min(1_000 * 2 ** (attempt - 1), 30_000);
        reconnectTimer = window.setTimeout(connect, delay);
      });
    }

    connect();
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [onCatalogUpdate, onFaviconUpdate, onStatusChange]);

  return connection;
}

function parseFaviconRuntimeId(event: Event): string | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return undefined;
  try {
    const payload: unknown = JSON.parse(event.data);
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'runtimeId' in payload &&
      typeof payload.runtimeId === 'string' &&
      payload.runtimeId.length > 0
    ) {
      return payload.runtimeId;
    }
  } catch {
    // Reconcile the complete catalog when an event cannot identify one icon.
  }
  return undefined;
}
