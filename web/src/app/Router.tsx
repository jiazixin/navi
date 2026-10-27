import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import type { WebSearchProviderID } from './api/webSearch'
import { navigationFailureTitle } from './serverCodes'
import { AuthGate } from '../features/auth/AuthGate'

const HomePage = lazy(() => import('./App').then((module) => ({ default: module.App })))
const FailurePage = lazy(() =>
  import('../features/navigation/NavigationFailure').then((module) => ({
    default: module.NavigationFailure,
  })),
)
const NotFoundPage = lazy(() =>
  import('../features/navigation/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  })),
)

type AppRouterProps = {
  configuredSearch: WebSearchProviderID
  navigationError: string | undefined
  retryPath: string | undefined
}

/** Routes remain server-backed: authentication and /go redirects are checked by Go first. */
export function AppRouter({ configuredSearch, navigationError, retryPath }: AppRouterProps) {
  return (
    <BrowserRouter>
      <Suspense fallback={<div role="status">正在加载…</div>}>
        <AuthGate>
          <Routes>
            <Route path="/" element={<HomePage configuredSearch={configuredSearch} />} />
            <Route path="*" element={<NotFoundPage />} />
            <Route path="/login" element={null} />
            <Route
              path="/go/*"
              element={
                <FailurePage
                  message={navigationFailureTitle(navigationError ?? 'link_not_found')}
                  retryPath={retryPath?.startsWith('/go/') === true ? retryPath : '/'}
                />
              }
            />
          </Routes>
        </AuthGate>
      </Suspense>
    </BrowserRouter>
  )
}
