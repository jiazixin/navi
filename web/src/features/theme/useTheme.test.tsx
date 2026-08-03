import { act, renderHook } from '@testing-library/react';
import type { CatalogTheme } from '../../shared/api/theme';
import { useTheme } from './useTheme';

type HookProps = {
  configuredTheme: CatalogTheme;
};

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-preference');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the configured theme when there is no local override', () => {
    const { result, rerender } = renderHook(
      ({ configuredTheme }: HookProps) => useTheme(configuredTheme),
      { initialProps: { configuredTheme: 'default' } },
    );

    expect(result.current.preference).toBe('default');
    expect(result.current.resolvedTheme).toBe('light');

    rerender({ configuredTheme: 'mint-tide' });
    expect(result.current.preference).toBe('mint-tide');
    expect(result.current.resolvedTheme).toBe('mint-tide');
    expect(document.documentElement.dataset.theme).toBe('mint-tide');
  });

  it('stores a local selection and keeps it above later configured defaults', () => {
    const { result, rerender } = renderHook(
      ({ configuredTheme }: HookProps) => useTheme(configuredTheme),
      { initialProps: { configuredTheme: 'tea-mist' } },
    );

    act(() => result.current.selectTheme('navy-blossom'));
    expect(result.current.preference).toBe('navy-blossom');
    expect(window.localStorage.getItem('navi.theme')).toBe('navy-blossom');

    rerender({ configuredTheme: 'moss-court' });
    expect(result.current.preference).toBe('navy-blossom');
  });

  it('restores a stored manual theme', () => {
    window.localStorage.setItem('navi.theme', 'violet-lime');
    const { result } = renderHook(() => useTheme('default'));
    expect(result.current.preference).toBe('violet-lime');
    expect(result.current.resolvedTheme).toBe('violet-lime');
  });

  it('ignores invalid stored values and resolves the default dark theme', () => {
    window.localStorage.setItem('navi.theme', 'invalid-theme');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string): MediaQueryList => ({
        matches: query.includes('prefers-color-scheme: dark'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    const { result } = renderHook(() => useTheme('default'));
    expect(result.current.preference).toBe('default');
    expect(result.current.resolvedTheme).toBe('dark');
  });
});
