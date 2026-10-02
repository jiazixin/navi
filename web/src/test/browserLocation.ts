// jsdom keeps window.location non-configurable. Preserve the real Window API
// while observing full-page navigation without starting an unsupported load.
export function mockBrowserLocation(pathname = '/') {
  const location = {
    pathname,
    replace: vi.fn<(path: string) => void>(),
    reload: vi.fn<() => void>(),
  };
  vi.stubGlobal('window', new Proxy(window, {
    get(target, property): unknown {
      if (property === 'location') return location;
      const value: unknown = Reflect.get(target, property);
      return value;
    },
  }));
  return location;
}
