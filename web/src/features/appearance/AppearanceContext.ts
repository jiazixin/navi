import { createContext } from 'react';
import type { PaletteID, PatternID, ThemePreference } from './options';

export type Appearance = {
  themePreference: ThemePreference;
  palette: PaletteID;
  pattern: PatternID;
  /** Pattern opacity from 20 to 100. */
  strength: number;
  motion: boolean;
  reducedMotion: boolean;
  /** Whether background patterns should animate (user motion setting and system preference). */
  animated: boolean;
  setThemePreference: (preference: ThemePreference) => void;
  setPattern: (pattern: PatternID) => void;
  setStrength: (strength: number) => void;
  setMotion: (motion: boolean) => void;
};

export const AppearanceContext = createContext<Appearance | null>(null);
