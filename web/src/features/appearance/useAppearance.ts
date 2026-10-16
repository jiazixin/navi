import { useContext } from 'react';
import { AppearanceContext, type Appearance } from './AppearanceContext';

export function useAppearance(): Appearance {
  const appearance = useContext(AppearanceContext);
  if (appearance === null) throw new Error('useAppearance must be used inside AppearanceProvider.');
  return appearance;
}
