import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogPage } from './api/catalog';
import { filterPage } from '../features/catalog/filterCatalog';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

export function useCatalogNavigation(pages: readonly CatalogPage[]) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentPageID, setCurrentPageID] = useState<string | null>(null);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);

  const currentPageIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === currentPageID),
  );
  const currentPage = pages[currentPageIndex];
  const filteredPage = useMemo(
    () => (currentPage === undefined ? undefined : filterPage(currentPage, searchQuery)),
    [currentPage, searchQuery],
  );

  useEffect(() => {
    const title = currentPage?.title;
    document.title = title === undefined ? 'Navi' : `${title} · Navi`;
  }, [currentPage?.title]);

  const focusFirstResult = useCallback((): void => {
    document.querySelector<HTMLAnchorElement>('main a[href^="/go/"]')?.focus();
  }, []);

  const openFirstResult = useCallback((): void => {
    document.querySelector<HTMLAnchorElement>('main a[href^="/go/"]')?.click();
  }, []);

  const focusSearch = useCallback((): void => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSearchOpen(true);
    } else {
      searchInputRef.current?.focus();
    }
  }, []);

  const handleSearchEscape = useCallback((): void => {
    if (searchQuery.length > 0) {
      setSearchQuery('');
      return;
    }
    searchInputRef.current?.blur();
  }, [searchQuery]);

  const handleQueryChange = useCallback((query: string): void => {
    setSearchQuery(query);
    if (query.length > 0) {
      setHasSearched(true);
    }
  }, []);

  const handlePageChange = useCallback(
    (nextIndex: number): void => {
      const nextPage = pages[nextIndex];
      if (nextPage === undefined || nextIndex === currentPageIndex) return;
      setPageDirection(nextIndex > currentPageIndex ? 1 : -1);
      setCurrentPageID(nextPage.id);
      setSearchQuery('');
      setHasSearched(false);
      setSearchOpen(false);
    },
    [currentPageIndex, pages],
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      const commandSearch = (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k';
      const slashSearch = event.key === '/' && !isEditableTarget(event.target);
      if (!commandSearch && !slashSearch) return;
      event.preventDefault();
      focusSearch();
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [focusSearch]);

  useEffect(() => {
    if (!searchOpen) return undefined;

    const desktopMediaQuery = window.matchMedia('(min-width: 768px)');
    const handleDesktopChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        setSearchOpen(false);
      }
    };
    desktopMediaQuery.addEventListener('change', handleDesktopChange);
    return () => desktopMediaQuery.removeEventListener('change', handleDesktopChange);
  }, [searchOpen]);

  return {
    searchInputRef,
    searchButtonRef,
    searchQuery,
    hasSearched,
    searchOpen,
    setSearchOpen,
    currentPageIndex,
    currentPage,
    filteredPage,
    pageDirection,
    focusFirstResult,
    openFirstResult,
    handleSearchEscape,
    handleQueryChange,
    handlePageChange,
  };
}
