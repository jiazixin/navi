import { catalogSchema } from '../shared/api/catalog';
import { mockCatalog } from './mockCatalog';

describe('mockCatalog', () => {
  it('provides a fixed, valid and uneven development catalog', () => {
    const catalog = catalogSchema.parse(mockCatalog);
    const primaryPage = catalog.pages[0];
    if (primaryPage === undefined) throw new Error('Primary mock page is missing');
    const links = primaryPage.groups.flatMap((group) => group.links);
    const groupSizes = primaryPage.groups.map((group) => group.links.length);
    const runtimeIDs = links.map((link) => link.runtimeId);

    expect(catalog.pages).toHaveLength(2);
    expect(primaryPage.groups).toHaveLength(10);
    expect(links).toHaveLength(83);
    expect(new Set(groupSizes).size).toBeGreaterThan(1);
    expect(new Set(runtimeIDs).size).toBe(runtimeIDs.length);
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runtimeId: 'github', publicUrl: 'https://github.com/' }),
        expect.objectContaining({ runtimeId: 'baidu', publicUrl: 'https://www.baidu.com/' }),
        expect.objectContaining({ runtimeId: 'google', publicUrl: 'https://www.google.com/' }),
        expect.objectContaining({
          runtimeId: 'grafana',
          privateUrl: 'http://grafana.lan:3000/',
          publicUrl: 'https://grafana.com/',
        }),
      ]),
    );
  });
});
