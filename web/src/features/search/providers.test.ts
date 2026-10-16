import { getSearchProvider } from './providers';

describe('search providers', () => {
  it('builds encoded search URLs for every direct provider', () => {
    const query = '导航 UI/UX';

    const baidu = new URL(getSearchProvider('baidu').buildURL(query));
    expect(baidu.hostname).toBe('www.baidu.com');
    expect(baidu.searchParams.get('wd')).toBe(query);

    const google = new URL(getSearchProvider('google').buildURL(query));
    expect(google.hostname).toBe('www.google.com');
    expect(google.searchParams.get('q')).toBe(query);

    const yandex = new URL(getSearchProvider('yandex').buildURL(query));
    expect(yandex.hostname).toBe('yandex.com');
    expect(yandex.searchParams.get('text')).toBe(query);

    const bing = new URL(getSearchProvider('bing').buildURL(query));
    expect(bing.hostname).toBe('www.bing.com');
    expect(bing.searchParams.get('q')).toBe(query);
    expect(bing.searchParams.get('mkt')).toBe('en-US');

    const github = new URL(getSearchProvider('github').buildURL(query));
    expect(github.hostname).toBe('github.com');
    expect(github.searchParams.get('q')).toBe(query);
    expect(github.searchParams.get('type')).toBe('repositories');

    const chatGPT = new URL(getSearchProvider('chatgpt').buildURL(query));
    expect(chatGPT.hostname).toBe('chatgpt.com');
    expect(chatGPT.searchParams.get('q')).toBe(query);
  });
});
