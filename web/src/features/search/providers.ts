import type { WebSearchProviderID } from '../../app/api/webSearch';

export type SearchProviderID = WebSearchProviderID;

export type SearchProvider = {
  id: SearchProviderID;
  label: string;
  shortLabel: string;
  category: 'web' | 'ai';
  submission: 'direct' | 'clipboard';
  homeURL: string;
  buildURL: (query: string) => string;
};

function withQuery(baseURL: string, entries: readonly (readonly [string, string])[]): string {
  const url = new URL(baseURL);
  for (const [key, value] of entries) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

const defaultSearchProvider: SearchProvider = {
  id: 'baidu',
  label: '百度',
  shortLabel: '百度',
  category: 'web',
  submission: 'direct',
  homeURL: 'https://www.baidu.com/',
  buildURL: (query) => withQuery('https://www.baidu.com/s', [['wd', query]]),
};

export const searchProviders: readonly SearchProvider[] = [
  defaultSearchProvider,
  {
    id: 'google',
    label: 'Google',
    shortLabel: 'Google',
    category: 'web',
    submission: 'direct',
    homeURL: 'https://www.google.com/',
    buildURL: (query) => withQuery('https://www.google.com/search', [['q', query]]),
  },
  {
    id: 'yandex',
    label: 'Yandex',
    shortLabel: 'Yandex',
    category: 'web',
    submission: 'direct',
    homeURL: 'https://yandex.com/',
    buildURL: (query) => withQuery('https://yandex.com/search/', [['text', query]]),
  },
  {
    id: 'bing',
    label: 'Bing 国际版',
    shortLabel: 'Bing',
    category: 'web',
    submission: 'direct',
    homeURL: 'https://www.bing.com/',
    buildURL: (query) =>
      withQuery('https://www.bing.com/search', [
        ['q', query],
        ['mkt', 'en-US'],
        ['setlang', 'en-US'],
      ]),
  },
  {
    id: 'github',
    label: 'GitHub',
    shortLabel: 'GitHub',
    category: 'web',
    submission: 'direct',
    homeURL: 'https://github.com/',
    buildURL: (query) =>
      withQuery('https://github.com/search', [
        ['q', query],
        ['type', 'repositories'],
      ]),
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    shortLabel: 'ChatGPT',
    category: 'ai',
    submission: 'direct',
    homeURL: 'https://chatgpt.com/',
    buildURL: (query) => withQuery('https://chatgpt.com/', [['q', query]]),
  },
  {
    id: 'claude',
    label: 'Claude',
    shortLabel: 'Claude',
    category: 'ai',
    submission: 'clipboard',
    homeURL: 'https://claude.ai/new',
    buildURL: () => 'https://claude.ai/new',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    shortLabel: 'Gemini',
    category: 'ai',
    submission: 'clipboard',
    homeURL: 'https://gemini.google.com/app',
    buildURL: () => 'https://gemini.google.com/app',
  },
] as const;

export function getSearchProvider(providerID: SearchProviderID): SearchProvider {
  return searchProviders.find((provider) => provider.id === providerID) ?? defaultSearchProvider;
}
