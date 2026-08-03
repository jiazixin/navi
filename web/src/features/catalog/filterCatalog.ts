import type { Catalog, CatalogLink } from '../../shared/api/catalog';

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function linkMatches(link: CatalogLink, groupName: string, query: string): boolean {
  const searchableValues = [
    link.name,
    groupName,
    link.description ?? '',
    ...link.tags,
  ];

  return searchableValues.some((value) => normalize(value).includes(query));
}

export function filterCatalog(catalog: Catalog, searchQuery: string): Catalog {
  const query = normalize(searchQuery);
  if (query.length === 0) {
    return catalog;
  }

  const groups = catalog.groups.flatMap((group) => {
    const links = group.links.filter((link) => linkMatches(link, group.name, query));
    return links.length > 0 ? [{ ...group, links }] : [];
  });

  return { ...catalog, groups };
}

export function countLinks(catalog: Catalog): number {
  return catalog.groups.reduce((total, group) => total + group.links.length, 0);
}
