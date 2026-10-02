import { z } from './schema';

export const webSearchProviderSchema = z.enum([
  'baidu',
  'google',
  'yandex',
  'bing',
  'github',
  'chatgpt',
  'claude',
  'gemini',
]);

export type WebSearchProviderID = z.infer<typeof webSearchProviderSchema>;

export const DEFAULT_WEB_SEARCH_PROVIDER: WebSearchProviderID = 'baidu';
