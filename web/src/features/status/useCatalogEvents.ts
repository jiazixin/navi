import { useEffect, useState } from 'react';

export type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'reconnecting'; attempt: number };

type UseCatalogEventsOptions = {
  onCatalogUpdate: () => void;
  onCatalogError: () => void;
};

export function useCatalogEvents({
  onCatalogUpdate,
  onCatalogError,
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
      });
      source.addEventListener('catalog.updated', onCatalogUpdate);
      source.addEventListener('favicon.updated', onCatalogUpdate);
      source.addEventListener('catalog.error', onCatalogError);
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
  }, [onCatalogError, onCatalogUpdate]);

  return connection;
}
