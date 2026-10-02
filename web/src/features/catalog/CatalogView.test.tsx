import { render, screen } from '@testing-library/react';
import { primaryPageFixture } from '../../../tests/fixtures/catalog';
import { CatalogView } from './CatalogView';

describe('CatalogView', () => {
  it('renders groups and links in source order', () => {
    render(<CatalogView page={primaryPageFixture} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '基础设施',
      '开发',
    ]);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      '打开 Grafana',
      '打开 GitHub',
    ]);
  });

  it('renders group headings without horizontal separators', () => {
    render(<CatalogView page={primaryPageFixture} />);

    const headingRow = screen.getByRole('heading', { name: '基础设施' }).parentElement;
    expect(headingRow?.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('labels each group independently when the catalog and search overlay coexist', () => {
    render(<><CatalogView page={primaryPageFixture} /><CatalogView page={primaryPageFixture} /></>);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(new Set(headings.map((heading) => heading.id)).size).toBe(headings.length);
    for (const heading of headings) {
      expect(heading.closest('section')).toHaveAttribute('aria-labelledby', heading.id);
    }
  });

  it('renders the search empty state without a decorative container', () => {
    render(<CatalogView page={{ ...primaryPageFixture, groups: [] }} searching />);
    expect(screen.getByRole('heading', { name: '没有匹配的链接' })).toBeVisible();
  });

  it('uses the shorter filter entrance for returning search results', () => {
    render(<CatalogView page={primaryPageFixture} entranceMode="filter" searching />);
    expect(screen.getByText('找到 2 个链接')).toBeInTheDocument();
  });
});
