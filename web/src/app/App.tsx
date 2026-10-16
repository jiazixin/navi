import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { StatePanel } from '../components/StatePanel';
import { AppearancePanel } from '../features/appearance/AppearancePanel';
import { Backdrop } from '../features/appearance/Backdrop';
import { getPattern } from '../features/appearance/options';
import { useAppearance } from '../features/appearance/useAppearance';
import { CatalogView } from '../features/catalog/CatalogView';
import { LoadingCatalog } from '../features/catalog/LoadingCatalog';
import { HeroClock } from '../features/clock/HeroClock';
import { CommandPalette } from '../features/search/CommandPalette';
import { HeroSearch } from '../features/search/HeroSearch';
import { buildSearchIndex } from '../features/search/linkSearch';
import { StatusBanner } from '../features/status/StatusBanner';
import { TopBar } from '../layouts/TopBar';
import type { WebSearchProviderID } from './api/webSearch';
import { useCatalogState } from './useCatalogState';
import { usePageSelection } from './usePageSelection';
import styles from './App.module.css';

type AppProps = {
  configuredSearch: WebSearchProviderID;
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function App({ configuredSearch }: AppProps): React.JSX.Element {
  const { catalogQuery, statusQuery, faviconVersions, connection, refreshCatalog, visibleBanner, dismissBanner } =
    useCatalogState();
  const appearance = useAppearance();
  const pages = useMemo(() => catalogQuery.data?.pages ?? [], [catalogQuery.data?.pages]);
  const [pageIndex, selectPage] = usePageSelection(pages);
  const page = pages[pageIndex];
  const searchIndex = useMemo(() => buildSearchIndex(pages), [pages]);
  const [providerID, setProviderID] = useState(configuredSearch);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const catalogRef = useRef<HTMLDivElement>(null);
  const appearancePanelID = `appearance-${useId().replace(/:/g, '')}`;
  const linkCount = page?.groups.reduce((total, group) => total + group.links.length, 0) ?? 0;

  useEffect(() => {
    document.title = page === undefined ? 'Navi' : `${page.title} · Navi`;
  }, [page]);

  useEffect(() => {
    const handleScroll = (): void => {
      setScrolled(window.scrollY > 24);
      const fade = 1 - Math.min(window.scrollY / (Math.max(window.innerHeight, 1) * 0.9), 1) * 0.55;
      document.documentElement.style.setProperty('--scroll-fade', fade.toFixed(3));
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setAppearanceOpen(false);
        setPaletteOpen((open) => !open);
      } else if (event.key === '/' && !isTyping(event.target) && !paletteOpen) {
        event.preventDefault();
        if (window.scrollY < window.innerHeight * 0.5 && heroInputRef.current !== null) heroInputRef.current.focus();
        else setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paletteOpen]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    searchButtonRef.current?.focus();
  }, []);

  const closeAppearance = useCallback((restoreFocus: boolean) => {
    setAppearanceOpen(false);
    if (restoreFocus) appearanceButtonRef.current?.focus();
  }, []);

  function handleSelectPage(index: number): void {
    if (index === pageIndex) return;
    selectPage(index);
    const catalogTop = (catalogRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 80;
    if (window.scrollY > catalogTop) window.scrollTo({ top: catalogTop, behavior: appearance.reducedMotion ? 'auto' : 'smooth' });
  }

  let catalog: React.ReactNode;
  if (catalogQuery.isPending) catalog = <LoadingCatalog />;
  else if (catalogQuery.data === undefined)
    catalog = (
      <StatePanel description="服务暂时没有返回导航目录，请检查连接后重试。" eyebrow="UNAVAILABLE" title="目录暂时无法加载">
        <button onClick={refreshCatalog} type="button">
          <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
          重新加载
        </button>
      </StatePanel>
    );
  else if (page === undefined || linkCount === 0)
    catalog = <StatePanel description="在 urls.yaml 中添加链接后，这里会自动更新。" eyebrow="EMPTY" title="目录还是空的" />;
  else catalog = <CatalogView faviconVersions={faviconVersions} key={page.id} page={page} />;

  return (
    <div className={styles.app}>
      <Backdrop />
      <TopBar
        appearanceButtonRef={appearanceButtonRef}
        appearanceOpen={appearanceOpen}
        appearancePanelID={appearancePanelID}
        connection={connection}
        currentIndex={pageIndex}
        isRefreshing={catalogQuery.isFetching || statusQuery.isFetching}
        onOpenSearch={() => {
          setAppearanceOpen(false);
          setPaletteOpen(true);
        }}
        onRefresh={refreshCatalog}
        onSelectPage={handleSelectPage}
        onToggleAppearance={() => setAppearanceOpen((open) => !open)}
        pages={pages}
        scrolled={scrolled}
        searchButtonRef={searchButtonRef}
      />

      <main className={styles.main}>
        <section aria-label="时间与搜索" className={styles.hero}>
          <h1 className={styles.visuallyHidden}>{page?.title ?? 'Navi'}</h1>
          {visibleBanner === null ? null : (
            <div className={styles.banner}>
              <StatusBanner
                kind={visibleBanner.kind}
                message={visibleBanner.message}
                onDismiss={() => dismissBanner(visibleBanner.message)}
              />
            </div>
          )}
          <div className={styles.heroInner}>
            <HeroClock />
            <HeroSearch
              faviconVersions={faviconVersions}
              index={searchIndex}
              inputRef={heroInputRef}
              onProviderChange={setProviderID}
              providerID={providerID}
            />
          </div>
          <div className={styles.heroFoot}>
            <a className={styles.cue} href="#catalog">
              <span aria-hidden="true" className={styles.cueLine} />
              {page === undefined ? '目录' : `目录 · ${page.groups.length} 个分区 · ${linkCount} 个链接`}
            </a>
            <span className={styles.patternBadge} data-animated={appearance.animated ? 'true' : 'false'}>
              <span aria-hidden="true" className={styles.live} />
              纹样 — <b>{getPattern(appearance.pattern).name}</b> {getPattern(appearance.pattern).en}
            </span>
          </div>
        </section>

        <div className={styles.catalog} id="catalog" ref={catalogRef}>
          {catalog}
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>Navi — 自托管导航 · Self-hosted start page</span>
          <span>
            {page?.subtitle ?? ''}
          </span>
          <a href="#">回到顶部 ↑</a>
        </div>
      </footer>

      {appearanceOpen ? (
        <AppearancePanel anchorRef={appearanceButtonRef} id={appearancePanelID} onClose={closeAppearance} />
      ) : null}
      {paletteOpen ? (
        <CommandPalette faviconVersions={faviconVersions} index={searchIndex} onClose={closePalette} providerID={providerID} />
      ) : null}
    </div>
  );
}
