import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BackgroundPattern } from '../features/background-pattern/BackgroundPattern';
import { useBackgroundPattern } from '../features/background-pattern/useBackgroundPattern';
import { CatalogView } from '../features/catalog/CatalogView';
import { LoadingCatalog } from '../features/catalog/LoadingCatalog';
import { PagePagination } from '../features/catalog/PagePagination';
import { SearchOverlay } from '../features/search/SearchOverlay';
import { StatusBanner } from '../features/status/StatusBanner';
import { useTheme } from '../features/theme/useTheme';
import { UniversalSearch } from '../features/web-search/UniversalSearch';
import { motionTokens } from '../styles/motion';
import { FailurePage } from '../components/EmptyState';
import { TopBar } from '../layouts/TopBar';
import { useCatalogState } from './useCatalogState';
import { useCatalogNavigation } from './useCatalogNavigation';
import styles from './App.module.css';

export function App(): React.JSX.Element {
  const {
    catalogQuery, statusQuery, faviconVersions, connection,
    refreshCatalog, visibleBanner, dismissBanner,
  } = useCatalogState();
  const pages = useMemo(() => catalogQuery.data?.pages ?? [], [catalogQuery.data?.pages]);
  const {
    searchInputRef, searchButtonRef, searchQuery, hasSearched, searchOpen, setSearchOpen,
    currentPageIndex, currentPage, filteredPage, pageDirection,
    focusFirstResult, openFirstResult, handleSearchEscape, handleQueryChange, handlePageChange,
  } = useCatalogNavigation(pages);
  const reduceMotion = useReducedMotion();
  const { preference: themePreference, selectTheme } = useTheme(catalogQuery.data?.theme ?? 'default');
  const { preference: backgroundPatternPreference, selectBackgroundPattern } =
    useBackgroundPattern(catalogQuery.data?.backgroundPattern ?? 'meridian-grid');

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
          mobileSearchButtonRef={searchButtonRef}
          subtitle={currentPage?.subtitle}
          themePreference={themePreference}
          title={currentPage?.title ?? 'Navi'}
        />

        <AnimatePresence initial={false}>
          {visibleBanner === null ? null : (
            <div className={styles.bannerSlot} key={visibleBanner.message}>
              <StatusBanner
                kind={visibleBanner.kind}
                message={visibleBanner.message}
                onDismiss={() => dismissBanner(visibleBanner.message)}
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
            desktopSearchInputRef={searchInputRef}
            mobileSearchButtonRef={searchButtonRef}
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
