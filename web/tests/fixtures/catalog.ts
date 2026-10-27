import type { Catalog, CatalogGroup, CatalogLink, CatalogPage } from '../../src/app/api/catalog'

const grafanaLink: CatalogLink = {
  runtime_id: 'grafana',
  name: 'Grafana',
  description: 'Metrics and dashboards',
  private_url: 'http://grafana.lan:3000',
  public_url: 'https://grafana.example.com',
  tags: ['monitoring', 'metrics'],
}

const githubLink: CatalogLink = {
  runtime_id: 'github',
  name: 'GitHub',
  description: 'Source code and collaboration',
  public_url: 'https://github.com',
  tags: ['code'],
}

export const longLink: CatalogLink = {
  runtime_id: 'long-link',
  name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGH',
  description:
    'This description intentionally reaches the documented one hundred and twenty character boundary without changing card geometry.',
  public_url: 'https://example.com',
  tags: ['boundary'],
}

const infrastructureGroup: CatalogGroup = {
  name: '基础设施',
  links: [grafanaLink],
}

const developmentGroup: CatalogGroup = {
  name: '开发',
  links: [githubLink],
}

export const primaryPageFixture: CatalogPage = {
  id: 'page1',
  title: '我的导航',
  subtitle: '工作、服务与常用资源',
  groups: [infrastructureGroup, developmentGroup],
}

const secondaryPageFixture: CatalogPage = {
  id: 'page2',
  title: '灵感收藏',
  subtitle: '阅读、设计与稍后探索',
  groups: [{ name: '收藏', links: [{ ...githubLink, runtime_id: 'github-page2' }] }],
}

export const catalogFixture: Catalog = {
  revision: 1,
  pages: [primaryPageFixture, secondaryPageFixture],
}
