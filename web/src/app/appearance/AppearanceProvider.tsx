import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { readStored, writeStored } from '../../lib/storage/localStorage'
import { AppearanceContext, type Appearance } from './AppearanceContext'
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
} from './options'

type AppearanceProviderProps = {
  configuredTheme: ThemePreference
  configuredPattern: PatternID
  children: ReactNode
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
  )
}

function clampStrength(value: number): number {
  return Math.min(maxPatternStrength, Math.max(minPatternStrength, Math.round(value)))
}

function readStrength(): number {
  const value = Number(readStored(storageKeys.strength))
  return Number.isFinite(value) && value >= minPatternStrength && value <= maxPatternStrength
    ? Math.round(value)
    : defaultPatternStrength
}

export function AppearanceProvider({
  configuredTheme,
  configuredPattern,
  children,
}: AppearanceProviderProps): React.JSX.Element {
  const [themePreference, setThemePreferenceState] = useState(() =>
    parseThemePreference(readStored(storageKeys.theme), configuredTheme),
  )
  const [pattern, setPatternState] = useState(() =>
    parsePattern(readStored(storageKeys.pattern), configuredPattern),
  )
  const [strength, setStrengthState] = useState(readStrength)
  const [isMotion, setMotionState] = useState(() => readStored(storageKeys.motion) !== 'off')
  const isPrefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const palette = resolvePalette(themePreference, isPrefersDark)

  useEffect(() => {
    const previous = document.documentElement.dataset.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    applyPalette(palette)
    return () => {
      if (previous === undefined) delete document.documentElement.dataset.theme
      else document.documentElement.dataset.theme = previous
      if (previousColor != null) meta?.setAttribute('content', previousColor)
    }
  }, [palette])

  useEffect(() => {
    const previous = document.documentElement.dataset.patternStrength
    document.documentElement.dataset.patternStrength = String(strength)
    return () => {
      if (previous === undefined) delete document.documentElement.dataset.patternStrength
      else document.documentElement.dataset.patternStrength = previous
    }
  }, [strength])

  // Panel callbacks occur in effect dependencies; preserve their identity between unrelated renders.
  const appearance = useMemo<Appearance>(
    () => ({
      themePreference,
      palette,
      pattern,
      strength,
      isMotion,
      isReducedMotion,
      isAnimated: isMotion && !isReducedMotion,
      setThemePreference(preference) {
        setThemePreferenceState(preference)
        writeStored(storageKeys.theme, preference)
      },
      setPattern(next) {
        setPatternState(next)
        writeStored(storageKeys.pattern, next)
      },
      setStrength(next) {
        const clamped = clampStrength(next)
        setStrengthState(clamped)
        writeStored(storageKeys.strength, String(clamped))
      },
      setMotion(isNext) {
        setMotionState(isNext)
        writeStored(storageKeys.motion, isNext ? 'on' : 'off')
      },
    }),
    [isMotion, palette, pattern, isReducedMotion, strength, themePreference],
  )

  return <AppearanceContext value={appearance}>{children}</AppearanceContext>
}
