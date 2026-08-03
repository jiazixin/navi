import { catalogFixture } from '../../test/fixtures';
import { countLinks, filterCatalog } from './filterCatalog';

describe('filterCatalog', () => {
  it('returns the original catalog for an empty query', () => {
    expect(filterCatalog(catalogFixture, '  ')).toBe(catalogFixture);
  });

  it.each([
    ['grafana', 'Grafana'],
    ['基础设施', 'Grafana'],
    ['dashboards', 'Grafana'],
    ['METRICS', 'Grafana'],
    ['开发', 'GitHub'],
    ['code', 'GitHub'],
  ])('matches %s without changing YAML order', (query, expectedName) => {
    const result = filterCatalog(catalogFixture, query);
    expect(countLinks(result)).toBe(1);
    expect(result.groups[0]?.links[0]?.name).toBe(expectedName);
  });

  it('removes empty groups and preserves catalog metadata', () => {
    const result = filterCatalog(catalogFixture, 'missing');
    expect(result.groups).toEqual([]);
    expect(result.revision).toBe(catalogFixture.revision);
    expect(result.site).toBe(catalogFixture.site);
  });

  it('counts links across groups', () => {
    expect(countLinks(catalogFixture)).toBe(2);
  });
});
