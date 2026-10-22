import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { readStored, writeStored } from '../../lib/storage/localStorage';
import { AppearanceContext, type Appearance } from './AppearanceContext';
import {
  applyPalette,
  defaultPatternStrength,
  maxPatternStrength,
  minPatternStrength,
  parsePattern,
  parseThemePreference,
  resolvePalette,
  storageKeys,
  type PatternID,
  type ThemePreference,
} from './options';

type AppearanceProviderProps = {
  configuredTheme: ThemePreference;
  configuredPattern: PatternID;
  children: ReactNode;
};

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
  );
}

function clampStrength(value: number): number {
  return Math.min(maxPatternStrength, Math.max(minPatternStrength, Math.round(value)));
}

function readStrength(): number {
  const value = Number(readStored(storageKeys.strength));
  return Number.isFinite(value) && value >= minPatternStrength && value <= maxPatternStrength
    ? Math.round(value)
    : defaultPatternStrength;
}

export function AppearanceProvider({ configuredTheme, configuredPattern, children }: AppearanceProviderProps): React.JSX.Element {
  const [themePreference, setThemePreferenceState] = useState(() =>
    parseThemePreference(readStored(storageKeys.theme), configuredTheme),
  );
  const [pattern, setPatternState] = useState(() => parsePattern(readStored(storageKeys.pattern), configuredPattern));
  const [strength, setStrengthState] = useState(readStrength);
  const [motion, setMotionState] = useState(() => readStored(storageKeys.motion) !== 'off');
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const palette = resolvePalette(themePreference, prefersDark);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  useEffect(() => {
    document.documentElement.style.setProperty('--pattern-strength', String(strength / 100));
  }, [strength]);

  const appearance = useMemo<Appearance>(
    () => ({
      themePreference,
      palette,
      pattern,
      strength,
      motion,
      reducedMotion,
      animated: motion && !reducedMotion,
      setThemePreference(preference) {
        setThemePreferenceState(preference);
        writeStored(storageKeys.theme, preference);
      },
      setPattern(next) {
        setPatternState(next);
        writeStored(storageKeys.pattern, next);
      },
      setStrength(next) {
        const clamped = clampStrength(next);
        setStrengthState(clamped);
        writeStored(storageKeys.strength, String(clamped));
      },
      setMotion(next) {
        setMotionState(next);
        writeStored(storageKeys.motion, next ? 'on' : 'off');
      },
    }),
    [motion, palette, pattern, reducedMotion, strength, themePreference],
  );

  return <AppearanceContext value={appearance}>{children}</AppearanceContext>;
}
