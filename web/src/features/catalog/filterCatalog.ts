import type { CatalogLink, CatalogPage } from '../../app/api/catalog';

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

export function filterPage(page: CatalogPage, searchQuery: string): CatalogPage {
  const query = normalize(searchQuery);
  if (query.length === 0) {
    return page;
  }

  const groups = page.groups.flatMap((group) => {
    const links = group.links.filter((link) => linkMatches(link, group.name, query));
    return links.length > 0 ? [{ ...group, links }] : [];
  });

  return { ...page, groups };
}

export function countLinks(page: CatalogPage): number {
  return page.groups.reduce((total, group) => total + group.links.length, 0);
}
