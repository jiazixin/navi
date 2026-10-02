import { z } from './schema';

const catalogThemeNames = [
  'default',
  'navy-blossom',
  'mint-tide',
  'moss-court',
  'tea-mist',
  'amber-tide',
  'sunny-coast',
  'violet-lime',
] as const;

export const catalogThemeSchema = z.enum(catalogThemeNames);

export type CatalogTheme = z.infer<typeof catalogThemeSchema>;
