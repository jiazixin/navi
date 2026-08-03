import { render, screen } from '@testing-library/react';
import { catalogFixture } from '../../test/fixtures';
import { CatalogView } from './CatalogView';

describe('CatalogView', () => {
  it('renders groups and links in source order', () => {
    render(<CatalogView catalog={catalogFixture} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '基础设施',
      '开发',
    ]);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      '打开 Grafana',
      '打开 GitHub',
    ]);
  });

  it('renders the search empty state without a decorative container', () => {
    render(<CatalogView catalog={{ ...catalogFixture, groups: [] }} searching />);
    expect(screen.getByRole('heading', { name: '没有匹配的链接' })).toBeVisible();
  });

  it('uses the shorter filter entrance for returning search results', () => {
    render(<CatalogView catalog={catalogFixture} entranceMode="filter" searching />);
    expect(screen.getByText('找到 2 个链接')).toBeInTheDocument();
  });
});
