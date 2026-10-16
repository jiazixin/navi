import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '../../app/api/auth';
import { AuthRequiredContext } from './AuthContext';
import { LoginPage } from './LoginPage';
import styles from './LoginPage.module.css';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps): React.JSX.Element {
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
    // Pages restored from the back-forward cache must re-check the session.
    const restore = (event: PageTransitionEvent): void => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  if (session.data?.authenticated === true) {
    return <AuthRequiredContext value={session.data.authRequired}>{children}</AuthRequiredContext>;
  }
  if (session.isPending) {
    return (
      <div className={styles.loading} role="status">
        正在加载…
      </div>
    );
  }
  return <LoginPage connectionError={session.isError} onRetry={() => void session.refetch()} />;
}
