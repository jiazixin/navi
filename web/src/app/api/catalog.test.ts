import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogFixture } from '../../../tests/fixtures/catalog'
import { catalogSchema, getCatalog } from './catalog'

describe('catalog API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decodes a valid catalog response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(catalogFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(getCatalog()).resolves.toEqual(catalogFixture)
  })

  it('passes an abort signal to fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(catalogFixture), { status: 200 }))
    const controller = new AbortController()

    await getCatalog(controller.signal)

    // The request signal combines the caller's cancel with the timeout.
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/catalog',
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    )
  })

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
                  runtime_id: 'invalid',
                  name: 'Invalid',
                  public_url: 'ftp://example.com',
                  tags: [],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('rejects a link without either URL', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      pages: [
        {
          ...catalogFixture.pages[0],
          groups: [{ name: '开发', links: [{ runtime_id: 'invalid', name: 'Invalid', tags: [] }] }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects duplicate page IDs', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      pages: [catalogFixture.pages[0], { ...catalogFixture.pages[1], id: 'page1' }],
    })
    expect(result.success).toBe(false)
  })

  it('ignores unknown response fields', () => {
    const result = catalogSchema.safeParse({
      ...catalogFixture,
      theme: 'unknown-theme',
    })

    expect(result.success).toBe(true)
  })

  it('surfaces HTTP errors without exposing response details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('failure', { status: 503 }))
    await expect(getCatalog()).rejects.toMatchObject({ status: 503, code: '' })
  })

  it('rejects invalid JSON and invalid catalog data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(new Response('not-json', { status: 200 }))
    await expect(getCatalog()).rejects.toMatchObject({ code: 'invalid_response' })

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ revision: 1 }), { status: 200 }))
    await expect(getCatalog()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

it('counts Unicode code points consistently with the YAML loader', () => {
  const page = {
    id: 'emoji',
    title: '😀'.repeat(40),
    subtitle: '😀'.repeat(100),
    groups: [
      {
        name: '😀'.repeat(40),
        links: [
          {
            runtime_id: 'emoji',
            name: '😀'.repeat(60),
            description: '😀'.repeat(120),
            tags: ['😀'.repeat(24)],
            public_url: 'https://example.com/',
          },
        ],
      },
    ],
  }
  expect(catalogSchema.safeParse({ ...catalogFixture, pages: [page] }).success).toBe(true)
  expect(
    catalogSchema.safeParse({
      ...catalogFixture,
      pages: [{ ...page, title: '😀'.repeat(41) }],
    }).success,
  ).toBe(false)
})
