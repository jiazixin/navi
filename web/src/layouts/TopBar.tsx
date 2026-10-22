import { useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { LogOut, RefreshCw, Search, SunMoon } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { AuthRequiredContext } from '../features/auth/AuthContext';
import type { ConnectionState } from '../features/status/useCatalogEvents';
import styles from './TopBar.module.css';

type TopBarProps = {
  pages: readonly { id: string; title: string }[];
  currentIndex: number;
  onSelectPage: (index: number) => void;
  connection: ConnectionState;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenSearch: () => void;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  appearanceOpen: boolean;
  appearancePanelID: string;
  onToggleAppearance: () => void;
  appearanceButtonRef: RefObject<HTMLButtonElement | null>;
  scrolled: boolean;
};

function connectionLabel(connection: ConnectionState, isRefreshing: boolean): string {
  if (isRefreshing) return '正在刷新目录';
  if (connection.kind === 'live') return '实时更新已连接，点击刷新';
  if (connection.kind === 'connecting') return '正在连接实时更新，点击刷新';
  return `实时更新正在重连，第 ${connection.attempt} 次，点击刷新`;
}

async function logout(): Promise<void> {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Navi-Request': '1' } });
    if (!response.ok) throw new Error('logout');
    window.location.replace('/login');
  } catch {
    window.alert('退出失败，请检查网络后重试。');
  }
}

export function TopBar({
  pages,
  currentIndex,
  onSelectPage,
  connection,
  isRefreshing,
  onRefresh,
  onOpenSearch,
  searchButtonRef,
  appearanceOpen,
  appearancePanelID,
  onToggleAppearance,
  appearanceButtonRef,
  scrolled,
}: TopBarProps): React.JSX.Element {
  const authRequired = useContext(AuthRequiredContext);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const refreshLabel = connectionLabel(connection, isRefreshing);

  useLayoutEffect(() => {
    const container = pagesRef.current;
    if (container === null) return undefined;
    const measure = (): void => {
      const button = container.querySelectorAll<HTMLElement>('button')[currentIndex];
      setIndicator(button === undefined ? null : { left: button.offsetLeft, width: button.offsetWidth });
      button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [currentIndex, pages]);

  return (
    <header className={styles.topBar} data-scrolled={scrolled ? 'true' : 'false'}>
      <div className={styles.inner}>
        <a aria-label="Navi 首页" className={styles.brand} href="/">
          <BrandMark className={styles.mark} />
          <span>NAVI</span>
        </a>
        {pages.length > 1 ? (
          <nav aria-label="导航页" className={styles.pages}>
            <div className={styles.pageTrack} ref={pagesRef}>
              {indicator === null ? null : (
                <span aria-hidden="true" className={styles.indicator} style={{ left: indicator.left, width: indicator.width }} />
              )}
              {pages.map((page, index) => (
                <button
                  aria-current={index === currentIndex ? 'page' : undefined}
                  className={styles.page}
                  key={page.id}
                  onClick={() => onSelectPage(index)}
                  type="button"
                >
                  {page.title}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
        <div className={styles.actions}>
          <button aria-label="搜索链接" className={styles.searchButton} onClick={onOpenSearch} ref={searchButtonRef} type="button">
            <Search aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>搜索链接</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
          <button
            aria-label={refreshLabel}
            className={styles.iconButton}
            data-loading={isRefreshing ? 'true' : 'false'}
            onClick={onRefresh}
            title={refreshLabel}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.8} />
            <span aria-hidden="true" className={styles.connection} data-state={connection.kind} />
          </button>
          <button
            aria-controls={appearanceOpen ? appearancePanelID : undefined}
            aria-expanded={appearanceOpen}
            aria-haspopup="dialog"
            aria-label="外观：纹样与色调"
            className={styles.iconButton}
            onClick={onToggleAppearance}
            ref={appearanceButtonRef}
            title="外观：纹样与色调"
            type="button"
          >
            <SunMoon aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
          {authRequired ? (
            <button aria-label="退出登录" className={styles.iconButton} onClick={() => void logout()} title="退出登录" type="button">
              <LogOut aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
