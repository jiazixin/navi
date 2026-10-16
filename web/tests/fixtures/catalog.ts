import type { Catalog, CatalogGroup, CatalogLink, CatalogPage } from '../../src/app/api/catalog';

export const fixtureIcon =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#f5f5f5"/><path d="M18 18h28v8H28v8h16v8H28v4H18z" fill="#111"/></svg>',
  );

export const grafanaLink: CatalogLink = {
  runtimeId: 'grafana',
  name: 'Grafana',
  description: 'Metrics and dashboards',
  privateUrl: 'http://grafana.lan:3000',
  publicUrl: 'https://grafana.example.com',
  tags: ['monitoring', 'metrics'],
};

export const githubLink: CatalogLink = {
  runtimeId: 'github',
  name: 'GitHub',
  description: 'Source code and collaboration',
  publicUrl: 'https://github.com',
  tags: ['code'],
};

export const longLink: CatalogLink = {
  runtimeId: 'long-link',
  name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGH',
  description:
    'This description intentionally reaches the documented one hundred and twenty character boundary without changing card geometry.',
  publicUrl: 'https://example.com',
  tags: ['boundary'],
};

export const infrastructureGroup: CatalogGroup = {
  name: '基础设施',
  links: [grafanaLink],
};

export const developmentGroup: CatalogGroup = {
  name: '开发',
  links: [githubLink],
};

export const primaryPageFixture: CatalogPage = {
  id: 'page1',
  title: '我的导航',
  subtitle: '工作、服务与常用资源',
  groups: [infrastructureGroup, developmentGroup],
};

export const secondaryPageFixture: CatalogPage = {
  id: 'page2',
  title: '灵感收藏',
  subtitle: '阅读、设计与稍后探索',
  groups: [{ name: '收藏', links: [{ ...githubLink, runtimeId: 'github-page2' }] }],
};

export const catalogFixture: Catalog = {
  revision: 1,
  pages: [primaryPageFixture, secondaryPageFixture],
};
