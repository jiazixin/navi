export const paletteIDs = ['ink', 'paper', 'celadon', 'dusk'] as const
export type PaletteID = (typeof paletteIDs)[number]

export const themePreferences = ['default', ...paletteIDs] as const
export type ThemePreference = (typeof themePreferences)[number]

export const patternIDs = ['contour', 'flow', 'guilloche', 'stars', 'ridge', 'none'] as const
export type PatternID = (typeof patternIDs)[number]
export type AnimatedPatternID = Exclude<PatternID, 'none'>

type PaletteOption = {
  id: PaletteID
  name: string
  en: string
}

const paletteByID: Record<PaletteID, PaletteOption> = {
  ink: { id: 'ink', name: '墨夜', en: 'Ink' },
  paper: { id: 'paper', name: '宣纸', en: 'Paper' },
  celadon: { id: 'celadon', name: '青瓷', en: 'Celadon' },
  dusk: { id: 'dusk', name: '暮紫', en: 'Dusk' },
}

export const palettes: readonly PaletteOption[] = paletteIDs.map((id) => paletteByID[id])

type PatternOption = { id: PatternID; name: string; en: string }

const patternByID: Record<PatternID, PatternOption> = {
  contour: { id: 'contour', name: '等高线', en: 'Contour' },
  flow: { id: 'flow', name: '流场', en: 'Flow field' },
  guilloche: { id: 'guilloche', name: '扭索纹', en: 'Guilloché' },
  stars: { id: 'stars', name: '星轨', en: 'Star trails' },
  ridge: { id: 'ridge', name: '山峦', en: 'Ridgeline' },
  none: { id: 'none', name: '素净', en: 'Plain' },
}

export const patterns: readonly PatternOption[] = patternIDs.map((id) => patternByID[id])

const DEFAULT_THEME: ThemePreference = 'default'
const DEFAULT_PATTERN: PatternID = 'contour'

/** Pattern opacity bounds and default, in percent. */
export const minPatternStrength = 20
export const maxPatternStrength = 100
export const defaultPatternStrength = 90

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some((entry) => entry === value)
}

export function parseThemePreference(
  value: unknown,
  fallback: ThemePreference = DEFAULT_THEME,
): ThemePreference {
  return isOneOf(themePreferences, value) ? value : fallback
}

export function parsePattern(value: unknown, fallback: PatternID = DEFAULT_PATTERN): PatternID {
  return isOneOf(patternIDs, value) ? value : fallback
}

export function resolvePalette(preference: ThemePreference, isPrefersDark: boolean): PaletteID {
  if (preference !== 'default') return preference
  return isPrefersDark ? 'ink' : 'paper'
}

export function getPalette(id: PaletteID): PaletteOption {
  return paletteByID[id]
}

export function getPattern(id: PatternID): PatternOption {
  return patternByID[id]
}

export const storageKeys = {
  theme: 'navi.theme',
  pattern: 'navi.pattern',
  strength: 'navi.pattern-strength',
  motion: 'navi.motion',
} as const

export function applyPalette(palette: PaletteID): void {
  document.documentElement.dataset.theme = palette
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    )
}
