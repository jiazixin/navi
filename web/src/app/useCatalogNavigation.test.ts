import { act, renderHook } from '@testing-library/react';
import { primaryPageFixture, secondaryPageFixture } from '../../tests/fixtures/catalog';
import { useCatalogNavigation } from './useCatalogNavigation';

describe('catalog navigation', () => {
  const pages = [primaryPageFixture, secondaryPageFixture];

  it('clears search and closes the overlay only when the page changes', () => {
    const { result } = renderHook(() => useCatalogNavigation(pages));
    act(() => {
      result.current.handleQueryChange('Grafana');
      result.current.setSearchOpen(true);
    });
    act(() => result.current.handlePageChange(0));
    expect(result.current.searchQuery).toBe('Grafana');
    expect(result.current.searchOpen).toBe(true);

    act(() => result.current.handlePageChange(1));
    expect(result.current.currentPage).toEqual(secondaryPageFixture);
    expect(result.current.searchQuery).toBe('');
    expect(result.current.hasSearched).toBe(false);
    expect(result.current.searchOpen).toBe(false);
    expect(result.current.pageDirection).toBe(1);
    expect(document.title).toBe(`${secondaryPageFixture.title} · Navi`);

    act(() => result.current.handlePageChange(0));
    expect(result.current.pageDirection).toBe(-1);
  });

  it('preserves the selected page across reordering and falls back after removal', () => {
    const { result, rerender } = renderHook(
      ({ catalogPages }) => useCatalogNavigation(catalogPages),
      { initialProps: { catalogPages: pages } },
    );
    act(() => result.current.handlePageChange(1));
    rerender({ catalogPages: [secondaryPageFixture, primaryPageFixture] });
    expect(result.current.currentPageIndex).toBe(0);
    expect(result.current.currentPage?.id).toBe(secondaryPageFixture.id);

    rerender({ catalogPages: [primaryPageFixture] });
    expect(result.current.currentPage?.id).toBe(primaryPageFixture.id);
    rerender({ catalogPages: [] });
    expect(result.current.filteredPage).toBeUndefined();
    expect(document.title).toBe('Navi');
  });

  it('filters the current page and clears the query on Escape', () => {
    const { result } = renderHook(() => useCatalogNavigation(pages));
    act(() => result.current.handleQueryChange('Grafana'));
    expect(result.current.filteredPage?.groups.flatMap((group) => group.links).map((link) => link.name))
      .toEqual(['Grafana']);
    act(() => result.current.handleSearchEscape());
    expect(result.current.searchQuery).toBe('');
    expect(result.current.filteredPage).toEqual(primaryPageFixture);
  });
});
