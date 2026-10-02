import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '../../app/api/auth';
import type { CatalogTheme } from '../../app/api/theme';
import { useTheme } from '../theme/useTheme';
import { AuthRequiredContext } from './AuthContext';
import styles from './LoginPage.module.css';
import { LoginPage } from './LoginPage';

type AuthGateProps = {
  children: ReactNode;
  configuredTheme?: CatalogTheme;
};

type LoginScreenProps = {
  configuredTheme: CatalogTheme;
  connectionError: boolean;
  onRetry: () => void;
};

function LoginScreen({ configuredTheme, connectionError, onRetry }: LoginScreenProps): React.JSX.Element {
  useTheme(configuredTheme);
  return <LoginPage connectionError={connectionError} onRetry={onRetry} />;
}

export function AuthGate({ children, configuredTheme = 'default' }: AuthGateProps): React.JSX.Element {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (session.data?.authenticated === false && window.location.pathname !== '/login') {
      window.location.replace('/login');
    } else if (session.data?.authenticated === true && window.location.pathname === '/login') {
      window.location.replace('/');
    }
  }, [session.data]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent): void => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);
  if (session.data?.authenticated === true) return <AuthRequiredContext value={session.data.authRequired}>{children}</AuthRequiredContext>;
  if (session.isPending) return <div className={styles.loading} role="status">正在加载…</div>;
  return <LoginScreen configuredTheme={configuredTheme} connectionError={session.isError}
    onRetry={() => { void session.refetch(); }} />;
}
