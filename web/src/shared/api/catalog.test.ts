import { catalogFixture } from '../../test/fixtures';
import { catalogSchema, getCatalog } from './catalog';

describe('catalog API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes a valid catalog response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(catalogFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getCatalog()).resolves.toEqual(catalogFixture);
  });

  it('passes an abort signal to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(catalogFixture), { status: 200 }),
    );
    const controller = new AbortController();

    await getCatalog(controller.signal);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/catalog',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('rejects unsupported URL protocols', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      pages: [
        {
          ...catalogFixture.pages[0],
          groups: [
            {
              name: '开发',
              links: [
                {
                  runtimeId: 'invalid',
                  name: 'Invalid',
                  publicUrl: 'ftp://example.com',
                  tags: [],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a link without either URL', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      pages: [
        {
          ...catalogFixture.pages[0],
          groups: [
            { name: '开发', links: [{ runtimeId: 'invalid', name: 'Invalid', tags: [] }] },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate page IDs', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      pages: [catalogFixture.pages[0], { ...catalogFixture.pages[1], id: 'page1' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown configured theme', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      theme: 'unknown-theme',
    });

    expect(result.success).toBe(false);
  });

  it('defaults a missing background pattern and accepts every documented value', () => {
    const withoutPattern = catalogSchema.parse({
      ...catalogFixture,
      backgroundPattern: undefined,
    });
    expect(withoutPattern.backgroundPattern).toBe('meridian-grid');

    for (const backgroundPattern of [
      'none',
      'meridian-grid',
      'orbital-rings',
      'pisces',
      'sagittarius',
      'roman-meander',
      'rose-window',
      'eight-point-star',
      'star-trails',
    ] as const) {
      expect(
        catalogSchema.safeParse({
          ...catalogFixture,
          backgroundPattern,
        }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown configured background pattern', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      backgroundPattern: 'random-lines',
    });

    expect(result.success).toBe(false);
  });

  it('defaults a missing web search provider and accepts every documented value', () => {
    const withoutProvider = catalogSchema.parse({
      ...catalogFixture,
      webSearch: undefined,
    });
    expect(withoutProvider.webSearch).toBe('baidu');

    for (const webSearch of [
      'baidu',
      'google',
      'yandex',
      'bing',
      'github',
      'chatgpt',
      'claude',
      'gemini',
    ] as const) {
      expect(
        catalogSchema.safeParse({
          ...catalogFixture,
          webSearch,
        }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown configured web search provider', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      webSearch: 'unknown-search',
    });

    expect(result.success).toBe(false);
  });

  it('surfaces HTTP errors without exposing response details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('failure', { status: 503 }));
    await expect(getCatalog()).rejects.toMatchObject({
      message: '请求暂时无法完成。',
      status: 503,
    });
  });

  it('rejects invalid JSON and invalid catalog data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(getCatalog()).rejects.toThrow('服务返回了无法读取的数据。');

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ revision: 1 }), { status: 200 }));
    await expect(getCatalog()).rejects.toThrow('服务返回的数据不符合目录协议。');
  });
});
