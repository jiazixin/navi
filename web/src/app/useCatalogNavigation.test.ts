import { act, render, renderHook, screen } from '@testing-library/react';
import { createElement } from 'react';
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

  it('does not intercept slash while editing nested contenteditable text', () => {
    renderHook(() => useCatalogNavigation(pages));
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', '');
    const text = document.createElement('span');
    editor.append(text);
    document.body.append(editor);
    // jsdom does not implement the inherited native isContentEditable property.
    Object.defineProperty(text, 'isContentEditable', { value: true });
    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    text.dispatchEvent(slash);
    expect(slash.defaultPrevented).toBe(false);
    editor.remove();
  });

  it('focuses search with shortcuts, leaves input text alone and removes its listener', () => {
    const focus = vi.fn();
    const { result, unmount } = renderHook(() => useCatalogNavigation(pages));
    const input = document.createElement('input');
    input.focus = focus;
    result.current.searchInputRef.current = input;
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true })); });
    expect(focus).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', metaKey: true })); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })); });
    expect(focus).toHaveBeenCalledTimes(3);
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(3);
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }));
    expect(focus).toHaveBeenCalledTimes(3);
    input.remove();
  });

  it('blurs an empty search and safely ignores absent result and page targets', () => {
    const blur = vi.fn();
    const { result } = renderHook(() => useCatalogNavigation(pages));
    const input = document.createElement('input');
    input.blur = blur;
    result.current.searchInputRef.current = input;
    act(() => result.current.handleSearchEscape());
    expect(blur).toHaveBeenCalledOnce();
    act(() => {
      result.current.focusFirstResult();
      result.current.openFirstResult();
      result.current.handlePageChange(-1);
      result.current.handlePageChange(pages.length);
      result.current.handleQueryChange('');
    });
    expect(result.current.currentPage).toEqual(primaryPageFixture);
    expect(result.current.hasSearched).toBe(false);
  });

  it('focuses and opens the first navigation result rather than other links', () => {
    function Results(): React.JSX.Element {
      const navigation = useCatalogNavigation(pages);
      return createElement('main', {},
        createElement('a', { href: '/help' }, '帮助'),
        createElement('a', { href: '/go/first', onClick: (event) => event.preventDefault() }, '首个结果'),
        createElement('button', { onClick: navigation.focusFirstResult }, '聚焦结果'),
        createElement('button', { onClick: navigation.openFirstResult }, '打开结果'),
      );
    }
    render(createElement(Results));
    const first = screen.getByRole('link', { name: '首个结果' });
    const click = vi.fn();
    first.addEventListener('click', click);
    act(() => screen.getByRole('button', { name: '聚焦结果' }).click());
    expect(first).toHaveFocus();
    act(() => screen.getByRole('button', { name: '打开结果' }).click());
    expect(click).toHaveBeenCalledOnce();
  });
});
