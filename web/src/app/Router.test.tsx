import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppRouter } from './Router'
import { AppearanceProvider } from './appearance/AppearanceProvider'

vi.mock('../features/auth/AuthGate', () => ({
  AuthGate: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./App', () => ({ App: () => <main>Navigation home</main> }))
vi.mock('../features/navigation/NavigationFailure', () => ({
  NavigationFailure: ({ message, retryPath }: { message: string; retryPath: string }) => (
    <main>
      {message}
      <a href={retryPath}>Retry</a>
    </main>
  ),
}))

describe('application routes', () => {
  it('serves the navigation home at the root route', async () => {
    window.history.replaceState(null, '', '/')
    render(<AppRouter configuredSearch="baidu" navigationError={undefined} retryPath={undefined} />)
    expect(await screen.findByRole('main')).toHaveTextContent('Navigation home')
  })

  it.each(['/navigation', '/client-route', '/index.html'])(
    'rejects the old home alias %s',
    async (path) => {
      window.history.replaceState(null, '', path)
      render(
        <AppearanceProvider configuredPattern="none" configuredTheme="ink">
          <AppRouter configuredSearch="baidu" navigationError={undefined} retryPath={undefined} />
        </AppearanceProvider>,
      )
      expect(await screen.findByRole('heading', { name: '页面不存在' })).toBeVisible()
      expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/')
      expect(screen.queryByText('Navigation home')).not.toBeInTheDocument()
    },
  )

  it('shows server navigation errors and refuses an external retry URL', async () => {
    window.history.replaceState(null, '', '/go/missing')
    render(
      <AppRouter
        configuredSearch="baidu"
        navigationError="link_not_found"
        retryPath="https://other.test"
      />,
    )
    expect(await screen.findByRole('main')).toHaveTextContent('链接不存在')
    expect(screen.getByRole('link', { name: 'Retry' })).toHaveAttribute('href', '/')
  })
})
