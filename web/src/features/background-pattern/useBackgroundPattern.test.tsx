import { act, renderHook } from '@testing-library/react';
import type { CatalogBackgroundPattern } from '../../shared/api/backgroundPattern';
import { useBackgroundPattern } from './useBackgroundPattern';

type HookProps = {
  configuredPattern: CatalogBackgroundPattern;
};

describe('useBackgroundPattern', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-background-pattern');
  });

  it('uses the configured pattern when there is no local override', () => {
    const { result, rerender } = renderHook(
      ({ configuredPattern }: HookProps) => useBackgroundPattern(configuredPattern),
      { initialProps: { configuredPattern: 'meridian-grid' } },
    );

    expect(result.current.preference).toBe('meridian-grid');
    rerender({ configuredPattern: 'rose-window' });
    expect(result.current.preference).toBe('rose-window');
    expect(document.documentElement.dataset.backgroundPattern).toBe('rose-window');
  });

  it('stores a local selection above later configured defaults', () => {
    const { result, rerender } = renderHook(
      ({ configuredPattern }: HookProps) => useBackgroundPattern(configuredPattern),
      { initialProps: { configuredPattern: 'pisces' } },
    );

    act(() => result.current.selectBackgroundPattern('sagittarius'));
    expect(result.current.preference).toBe('sagittarius');
    expect(window.localStorage.getItem('navi.background-pattern')).toBe('sagittarius');

    rerender({ configuredPattern: 'roman-meander' });
    expect(result.current.preference).toBe('sagittarius');
  });

  it('restores valid stored values and ignores invalid ones', () => {
    window.localStorage.setItem('navi.background-pattern', 'star-trails');
    const { result, unmount } = renderHook(() => useBackgroundPattern('meridian-grid'));
    expect(result.current.preference).toBe('star-trails');
    unmount();

    window.localStorage.setItem('navi.background-pattern', 'unknown-pattern');
    const fallback = renderHook(() => useBackgroundPattern('orbital-rings'));
    expect(fallback.result.current.preference).toBe('orbital-rings');
  });
});
