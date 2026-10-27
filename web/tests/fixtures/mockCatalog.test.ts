import { describe, expect, it } from 'vitest'
import { catalogSchema } from '../../src/app/api/catalog'
import { mockCatalog } from './mockCatalog'

describe('mockCatalog', () => {
  it('provides a fixed, valid and uneven development catalog', () => {
    const catalog = catalogSchema.parse(mockCatalog)
    const primaryPage = catalog.pages[0]
    if (primaryPage === undefined) throw new Error('Primary mock page is missing')
    const links = primaryPage.groups.flatMap((group) => group.links)
    const groupSizes = primaryPage.groups.map((group) => group.links.length)
    const runtimeIDs = links.map((link) => link.runtime_id)

    expect(catalog.pages).toHaveLength(2)
    expect(primaryPage.groups).toHaveLength(10)
    expect(links).toHaveLength(83)
    expect(new Set(groupSizes).size).toBeGreaterThan(1)
    expect(new Set(runtimeIDs).size).toBe(runtimeIDs.length)
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runtime_id: 'github', public_url: 'https://github.com/' }),
        expect.objectContaining({ runtime_id: 'baidu', public_url: 'https://www.baidu.com/' }),
        expect.objectContaining({ runtime_id: 'google', public_url: 'https://www.google.com/' }),
        expect.objectContaining({
          runtime_id: 'grafana',
          private_url: 'http://grafana.lan:3000/',
          public_url: 'https://grafana.com/',
        }),
      ]),
    )
  })
})
