import { catalogFixture } from '../../../tests/fixtures/catalog';
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

  it('rejects appearance settings, which are served with the page shell', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      theme: 'unknown-theme',
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

it('counts Unicode code points consistently with the YAML loader', () => {
  const page = { id: 'emoji', title: '😀'.repeat(40), subtitle: '😀'.repeat(100), groups: [
    { name: '😀'.repeat(40), links: [{ runtimeId: 'emoji', name: '😀'.repeat(60), description: '😀'.repeat(120), tags: ['😀'.repeat(24)], publicUrl: 'https://example.com/' }] },
  ] };
  expect(catalogSchema.safeParse({ ...catalogFixture, pages: [page] }).success).toBe(true);
  expect(catalogSchema.safeParse({ ...catalogFixture, pages: [{ ...page, title: '😀'.repeat(41) }] }).success).toBe(false);
});
