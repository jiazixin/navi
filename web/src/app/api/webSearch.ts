import { z } from './schema'

export const webSearchProviderSchema = z.enum([
  'baidu',
  'google',
  'yandex',
  'bing',
  'github',
  'chatgpt',
  'claude',
  'gemini',
])

export type WebSearchProviderID = z.infer<typeof webSearchProviderSchema>

export const DEFAULT_WEB_SEARCH_PROVIDER: WebSearchProviderID = 'baidu'

/** Resolves a URL selection without allowing an unknown provider into search links. */
export function parseWebSearchProvider(value: string): WebSearchProviderID {
  const result = webSearchProviderSchema.safeParse(value)
  return result.success ? result.data : DEFAULT_WEB_SEARCH_PROVIDER
}
