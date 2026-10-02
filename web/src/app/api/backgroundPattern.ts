import { z } from './schema';

export const backgroundPatternIDs = [
  'none',
  'meridian-grid',
  'orbital-rings',
  'pisces',
  'sagittarius',
  'roman-meander',
  'rose-window',
  'eight-point-star',
  'star-trails',
] as const;

export const DEFAULT_BACKGROUND_PATTERN = 'meridian-grid' as const;

export const catalogBackgroundPatternSchema = z.enum(backgroundPatternIDs);

export type CatalogBackgroundPattern = z.infer<typeof catalogBackgroundPatternSchema>;
