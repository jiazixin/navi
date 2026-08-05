import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BackgroundPattern } from '../features/background-pattern/BackgroundPattern';
import { useBackgroundPattern } from '../features/background-pattern/useBackgroundPattern';
import { CatalogView } from '../features/catalog/CatalogView';
import { filterPage } from '../features/catalog/filterCatalog';
import { LoadingCatalog } from '../features/catalog/LoadingCatalog';
import { PagePagination } from '../features/catalog/PagePagination';
import { SearchOverlay } from '../features/search/SearchOverlay';
import { StatusBanner, type StatusBannerKind } from '../features/status/StatusBanner';
import { useCatalogEvents } from '../features/status/useCatalogEvents';
import { useTheme } from '../features/theme/useTheme';
import { UniversalSearch } from '../features/web-search/UniversalSearch';
import { motionTokens } from '../motion/tokens';
import { getCatalog } from '../shared/api/catalog';
import { getServiceStatus } from '../shared/api/status';
import { FailurePage } from '../shared/ui/EmptyState';
import { TopBar } from './TopBar';
import styles from './App.module.css';

type BannerState = {
  kind: StatusBannerKind;
  message: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, select, [contenteditable="true"]');
}

export function App(): React.JSX.Element {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);
  const [faviconVersions, setFaviconVersions] = useState<Record<string, number>>({});
  const [currentPageID, setCurrentPageID] = useState<string | null>(null);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  const reduceMotion = useReducedMotion();

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => getCatalog(signal),
  });
  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => getServiceStatus(signal),
    retry: 1,
  });
  const { preference, selectTheme } = useTheme(catalogQuery.data?.theme ?? 'default');
  const { preference: backgroundPatternPreference, selectBackgroundPattern } =
    useBackgroundPattern(catalogQuery.data?.backgroundPattern ?? 'meridian-grid');

  const refreshCatalog = useCallback((): void => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['status'] }),
    ]);
  }, [queryClient]);

  const handleCatalogError = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['status'] });
  }, [queryClient]);

  const handleFaviconUpdate = useCallback((runtimeId: string): void => {
    setFaviconVersions((current) => ({ ...current, [runtimeId]: (current[runtimeId] ?? 0) + 1 }));
  }, []);

  const connection = useCatalogEvents({
    onCatalogUpdate: refreshCatalog,
    onCatalogError: handleCatalogError,
    onFaviconUpdate: handleFaviconUpdate,
  });

  const pages = useMemo(() => catalogQuery.data?.pages ?? [], [catalogQuery.data?.pages]);
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

  const banner = useMemo<BannerState | null>(() => {
    if (catalogQuery.isError && catalogQuery.data !== undefined) {
      return { kind: 'degraded', message: '目录刷新失败，当前仍显示最近一次有效内容。' };
    }
    if (statusQuery.data?.health === 'degraded') {
      return {
        kind: 'degraded',
        message: statusQuery.data.message ?? '服务处于降级状态，导航仍可继续使用。',
      };
    }
    if (connection.kind === 'reconnecting') {
      return { kind: 'offline', message: '实时更新暂时中断，正在后台重新连接。' };
    }
    return null;
  }, [catalogQuery.data, catalogQuery.isError, connection.kind, statusQuery.data]);

  const visibleBanner = banner !== null && banner.message !== dismissedBanner ? banner : null;

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

    const desktop = window.matchMedia('(min-width: 768px)');
    const handleChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        setSearchOpen(false);
        searchInputRef.current?.focus();
      }
    };
    desktop.addEventListener('change', handleChange);
    return () => desktop.removeEventListener('change', handleChange);
  }, [searchOpen]);

  return (
    <div className={styles.app}>
      <BackgroundPattern pattern={backgroundPatternPreference} />

      <div
        className={styles.shell}
        data-has-pagination={pages.length > 1 ? 'true' : 'false'}
        id="navi-shell"
      >
        <TopBar
          backgroundPatternPreference={backgroundPatternPreference}
          connection={connection}
          isRefreshing={catalogQuery.isFetching || statusQuery.isFetching}
          onMoveToResults={focusFirstResult}
          onOpenFirstResult={openFirstResult}
          onOpenSearch={() => setSearchOpen(true)}
          onBackgroundPatternChange={selectBackgroundPattern}
          onQueryChange={handleQueryChange}
          onRefresh={refreshCatalog}
          onSearchEscape={handleSearchEscape}
          onThemeChange={selectTheme}
          query={searchQuery}
          searchInputRef={searchInputRef}
          subtitle={currentPage?.subtitle}
          themePreference={preference}
          title={currentPage?.title ?? 'Navi'}
        />

        <AnimatePresence initial={false}>
          {visibleBanner === null ? null : (
            <div className={styles.bannerSlot} key={visibleBanner.message}>
              <StatusBanner
                kind={visibleBanner.kind}
                message={visibleBanner.message}
                onDismiss={() => setDismissedBanner(visibleBanner.message)}
              />
            </div>
          )}
        </AnimatePresence>

        <UniversalSearch
          configuredProviderID={catalogQuery.data?.webSearch ?? 'baidu'}
        />

        <main className={styles.main}>
          {catalogQuery.isPending ? <LoadingCatalog /> : null}
          {catalogQuery.isError && catalogQuery.data === undefined ? (
            <FailurePage onRetry={refreshCatalog} />
          ) : null}
          <AnimatePresence custom={pageDirection} initial={false} mode="wait">
            {filteredPage === undefined ? null : (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className={styles.pagePanel}
                exit={{ opacity: 0, x: reduceMotion ? 0 : pageDirection * -24 }}
                initial={{ opacity: 0, x: reduceMotion ? 0 : pageDirection * 24 }}
                key={filteredPage.id}
                transition={{
                  duration: reduceMotion ? motionTokens.instant : motionTokens.standard,
                  ease: [0.2, 0, 0, 1],
                }}
              >
                <CatalogView
                  entranceMode={hasSearched ? 'filter' : 'initial'}
                  faviconVersions={faviconVersions}
                  page={filteredPage}
                  searching={searchQuery.length > 0}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {pages.length > 1 ? (
          <footer className={styles.paginationSlot}>
            <PagePagination
              currentIndex={currentPageIndex}
              onChange={handlePageChange}
              pages={pages}
            />
          </footer>
        ) : null}
      </div>

      <AnimatePresence>
        {searchOpen && filteredPage !== undefined ? (
          <SearchOverlay
            faviconVersions={faviconVersions}
            key="search-overlay"
            onChange={handleQueryChange}
            onClose={() => setSearchOpen(false)}
            page={filteredPage}
            query={searchQuery}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
