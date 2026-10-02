import { useContext, type RefObject } from 'react';
import { AuthRequiredContext } from '../features/auth/AuthContext';
import { LogOut, RefreshCw, Search } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { BackgroundPatternButton } from '../features/background-pattern/BackgroundPatternButton';
import type { BackgroundPatternPreference } from '../features/background-pattern/useBackgroundPattern';
import { motionTokens } from '../styles/motion';
import { SearchField } from '../features/search/SearchField';
import type { ConnectionState } from '../features/status/useCatalogEvents';
import { ThemeButton } from '../features/theme/ThemeButton';
import type { ThemePreference } from '../features/theme/useTheme';
import { IconButton } from '../components/IconButton';
import styles from './TopBar.module.css';

type TopBarProps = {
  title: string;
  subtitle: string | undefined;
  query: string;
  connection: ConnectionState;
  isRefreshing: boolean;
  backgroundPatternPreference: BackgroundPatternPreference;
  themePreference: ThemePreference;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onSearchEscape: () => void;
  onMoveToResults: () => void;
  onOpenFirstResult: () => void;
  onOpenSearch: () => void;
  onRefresh: () => void;
  onBackgroundPatternChange: (pattern: BackgroundPatternPreference) => void;
  onThemeChange: (theme: ThemePreference) => void;
};

function getConnectionLabel(connection: ConnectionState, isRefreshing: boolean): string {
  if (isRefreshing) return '正在刷新目录';
  if (connection.kind === 'live') return '实时更新已连接，点击刷新';
  if (connection.kind === 'connecting') return '正在连接实时更新，点击刷新';
  return `实时更新正在重连，第 ${connection.attempt} 次，点击刷新`;
}

export function TopBar({
  title,
  subtitle,
  query,
  connection,
  isRefreshing,
  backgroundPatternPreference,
  themePreference,
  searchInputRef,
  onQueryChange,
  onSearchEscape,
  onMoveToResults,
  onOpenFirstResult,
  onOpenSearch,
  onRefresh,
  onBackgroundPatternChange,
  onThemeChange,
}: TopBarProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const authRequired = useContext(AuthRequiredContext);
  async function logout(): Promise<void> {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Navi-Request': '1' } });
      if (!response.ok) throw new Error('logout');
      window.location.replace('/login');
    } catch { window.alert('退出失败，请检查网络后重试。'); }
  }

  return (
    <motion.header
      animate={{ opacity: 1 }}
      className={styles.topBar}
      initial={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.standard }}
    >
      <div className={styles.inner}>
        <div className={styles.identity}>
          <span className={styles.title} title={title}>
            {title}
          </span>
          {subtitle !== undefined && subtitle.length > 0 ? (
            <>
              <span className={styles.identityRule} aria-hidden="true" />
              <span className={styles.subtitle} title={subtitle}>
                {subtitle}
              </span>
            </>
          ) : null}
        </div>
        <div className={styles.desktopSearch}>
          <SearchField
            inputRef={searchInputRef}
            onChange={onQueryChange}
            onEscape={onSearchEscape}
            onMoveToResults={onMoveToResults}
            onOpenFirstResult={onOpenFirstResult}
            value={query}
          />
        </div>
        <div className={styles.commands}>
          <IconButton className={styles.mobileSearch} label="打开搜索" onClick={onOpenSearch}>
            <Search aria-hidden="true" size={19} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            className={styles.refresh}
            data-loading={isRefreshing ? 'true' : 'false'}
            label={getConnectionLabel(connection, isRefreshing)}
            onClick={onRefresh}
            tooltipAlign="end"
          >
            <span className={styles.refreshGlyph}>
              <RefreshCw aria-hidden="true" size={19} strokeWidth={1.8} />
              <span className={styles.connectionDot} data-state={connection.kind} />
            </span>
          </IconButton>
          <ThemeButton onChange={onThemeChange} preference={themePreference} />
          <BackgroundPatternButton
            onChange={onBackgroundPatternChange}
            preference={backgroundPatternPreference}
          />
          {authRequired && <IconButton label="退出登录" onClick={() => { void logout(); }} tooltipAlign="end">
            <LogOut aria-hidden="true" size={19} strokeWidth={1.8} />
          </IconButton>}
        </div>
      </div>
    </motion.header>
  );
}
