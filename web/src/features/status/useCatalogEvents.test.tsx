import { act, renderHook } from '@testing-library/react';
import { useCatalogEvents } from './useCatalogEvents';

type EventListener = EventListenerOrEventListenerObject;

class EventSourceMock {
  static instances: EventSourceMock[] = [];
  readonly listeners = new Map<string, EventListener[]>();
  closed = false;

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: Event = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

describe('useCatalogEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EventSourceMock.instances = [];
    vi.stubGlobal('EventSource', EventSourceMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('tracks connection state and routes catalog events', () => {
    const onCatalogUpdate = vi.fn();
    const onStatusChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCatalogEvents({ onCatalogUpdate, onStatusChange }),
    );
    const source = EventSourceMock.instances[0];
    expect(source?.url).toBe('/api/events');

    act(() => source?.emit('open'));
    expect(result.current).toEqual({ kind: 'live' });

    act(() => source?.emit('catalog.updated'));
    act(() => source?.emit('favicon.updated'));
    act(() => source?.emit('catalog.error'));
    act(() => source?.emit('status.updated'));
    expect(onCatalogUpdate).toHaveBeenCalledTimes(3);
    expect(onStatusChange).toHaveBeenCalledTimes(2);

    unmount();
    expect(source?.closed).toBe(true);
  });

  it('reconnects with exponential backoff after an error', async () => {
    const onCatalogUpdate = vi.fn();
    const onStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useCatalogEvents({ onCatalogUpdate, onStatusChange }),
    );
    const first = EventSourceMock.instances[0];

    act(() => first?.emit('error'));
    expect(result.current).toEqual({ kind: 'reconnecting', attempt: 1 });
    expect(first?.closed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(EventSourceMock.instances).toHaveLength(2);
    act(() => EventSourceMock.instances[1]?.emit('open'));
    expect(onCatalogUpdate).toHaveBeenCalledTimes(1);
  });

  it('routes favicon events to the affected runtime ID', () => {
    const onCatalogUpdate = vi.fn();
    const onFaviconUpdate = vi.fn();
    const { unmount } = renderHook(() =>
      useCatalogEvents({
        onCatalogUpdate,
        onStatusChange: vi.fn(),
        onFaviconUpdate,
      }),
    );
    const source = EventSourceMock.instances[0];

    act(() => {
      source?.emit(
        'favicon.updated',
        new MessageEvent('favicon.updated', { data: JSON.stringify({ runtimeId: 'github' }) }),
      );
    });

    expect(onFaviconUpdate).toHaveBeenCalledWith('github');
    expect(onCatalogUpdate).not.toHaveBeenCalled();
    unmount();
  });
});
