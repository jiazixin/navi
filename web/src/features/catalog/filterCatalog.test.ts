import { primaryPageFixture } from '../../../tests/fixtures/catalog';
import { countLinks, filterPage } from './filterCatalog';

describe('filterPage', () => {
  const page = primaryPageFixture;

  it('returns the original catalog for an empty query', () => {
    expect(filterPage(page, '  ')).toBe(page);
  });

  it.each([
    ['grafana', 'Grafana'],
    ['基础设施', 'Grafana'],
    ['dashboards', 'Grafana'],
    ['METRICS', 'Grafana'],
    ['开发', 'GitHub'],
    ['code', 'GitHub'],
  ])('matches %s without changing YAML order', (query, expectedName) => {
    const result = filterPage(page, query);
    expect(countLinks(result)).toBe(1);
    expect(result.groups[0]?.links[0]?.name).toBe(expectedName);
  });

  it('removes empty groups and preserves catalog metadata', () => {
    const result = filterPage(page, 'missing');
    expect(result.groups).toEqual([]);
    expect(result.id).toBe(page.id);
    expect(result.title).toBe(page.title);
  });

  it('counts links across groups', () => {
    expect(countLinks(page)).toBe(2);
  });
});
