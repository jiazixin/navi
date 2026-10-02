import { useCallback, useEffect, useState } from 'react';
import { catalogThemeSchema, type CatalogTheme } from '../../app/api/theme';
import { getThemeOption } from './themeOptions';

export type ThemePreference = CatalogTheme;
type ResolvedTheme = 'light' | 'dark' | Exclude<CatalogTheme, 'default'>;

const storageKey = 'navi.theme';

function readPreference(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    const result = catalogThemeSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  return preference === 'default' ? (systemIsDark ? 'dark' : 'light') : preference;
}

export function useTheme(configuredTheme: CatalogTheme = 'default'): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  selectTheme: (theme: ThemePreference) => void;
} {
  const [localPreference, setLocalPreference] = useState<ThemePreference | null>(readPreference);
  const preference = localPreference ?? configuredTheme;
  const [systemIsDark, setSystemIsDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme = resolveTheme(preference, systemIsDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent): void => setSystemIsDark(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = preference;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      'content',
      resolvedTheme === 'dark'
        ? '#0a0a0a'
        : resolvedTheme === 'light'
          ? '#ffffff'
          : getThemeOption(resolvedTheme).metaColor,
    );
  }, [preference, resolvedTheme]);

  const selectTheme = useCallback((theme: ThemePreference): void => {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Preferences remain usable for this session when storage is unavailable.
    }
    setLocalPreference(theme);
  }, []);

  return { preference, resolvedTheme, selectTheme };
}
