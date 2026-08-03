import { useCallback, useEffect, useState } from 'react';
import {
  catalogBackgroundPatternSchema,
  type CatalogBackgroundPattern,
} from '../../shared/api/backgroundPattern';

export type BackgroundPatternPreference = CatalogBackgroundPattern;

const storageKey = 'navi.background-pattern';

function readPreference(): BackgroundPatternPreference | null {
  const value = window.localStorage.getItem(storageKey);
  const result = catalogBackgroundPatternSchema.safeParse(value);
  return result.success ? result.data : null;
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
    window.localStorage.setItem(storageKey, pattern);
    setLocalPreference(pattern);
  }, []);

  return { preference, selectBackgroundPattern };
}
