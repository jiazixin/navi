import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onUnauthenticated } from '../../app/api'
import { authKeys, useAuthData } from './useAuthData'
import { AuthRequiredContext } from '../../app/AuthContext'
const LoginPage = lazy(() =>
  import('./LoginPage').then((module) => ({ default: module.LoginPage })),
)
import styles from './LoginPage.module.css'

type AuthGateProps = {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const session = useAuthData()

  useEffect(() => {
    let isActive = true
    queueMicrotask(() => {
      if (!isActive) return
      if (session.data?.authenticated === false && window.location.pathname !== '/login') {
        window.location.replace('/login')
      } else if (session.data?.authenticated === true && window.location.pathname === '/login') {
        window.location.replace('/')
      }
    })
    return () => {
      isActive = false
    }
  }, [session.data])

  // Any request that finds the session expired signs the page out.
  useEffect(
    () =>
      onUnauthenticated(() => {
        queryClient.setQueryData(authKeys.session(), { authenticated: false, auth_required: true })
      }),
    [queryClient],
  )

  useEffect(() => {
    // Pages restored from the back-forward cache must re-check the session.
    const restore = (event: PageTransitionEvent): void => {
      if (event.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [])

  if (session.data?.authenticated === true) {
    return <AuthRequiredContext value={session.data.auth_required}>{children}</AuthRequiredContext>
  }
  if (session.isPending) {
    return (
      <div className={styles.loading} role="status">
        正在加载…
      </div>
    )
  }
  return (
    <Suspense fallback={<div role="status">正在加载…</div>}>
      <LoginPage
        isConnectionError={session.isError}
        onRetry={() => {
          void session.refetch().catch(() => {
            /* Query state owns the retry error. */
          })
        }}
      />
    </Suspense>
  )
}
