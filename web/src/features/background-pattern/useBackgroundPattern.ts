import { useCallback, useEffect, useState } from 'react';
import {
  catalogBackgroundPatternSchema,
  type CatalogBackgroundPattern,
} from '../../app/api/backgroundPattern';

export type BackgroundPatternPreference = CatalogBackgroundPattern;

const storageKey = 'navi.background-pattern';

function readPreference(): BackgroundPatternPreference | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    const result = catalogBackgroundPatternSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function useBackgroundPattern(configuredPattern: CatalogBackgroundPattern): {
  preference: BackgroundPatternPreference;
  selectBackgroundPattern: (pattern: BackgroundPatternPreference) => void;
} {
  const [localPreference, setLocalPreference] = useState<BackgroundPatternPreference | null>(
    readPreference,
  );
  const preference = localPreference ?? configuredPattern;

  useEffect(() => {
    document.documentElement.dataset.backgroundPattern = preference;
  }, [preference]);

  const selectBackgroundPattern = useCallback((pattern: BackgroundPatternPreference): void => {
    try {
      window.localStorage.setItem(storageKey, pattern);
    } catch {
      // Preferences remain usable for this session when storage is unavailable.
    }
    setLocalPreference(pattern);
  }, []);

  return { preference, selectBackgroundPattern };
}
