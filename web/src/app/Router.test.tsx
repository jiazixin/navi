import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppRouter } from './Router'

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
  it('preserves the server SPA fallback for bookmarks such as /navigation', async () => {
    window.history.replaceState(null, '', '/navigation')
    render(<AppRouter configuredSearch="baidu" navigationError={undefined} retryPath={undefined} />)
    expect(await screen.findByRole('main')).toHaveTextContent('Navigation home')
  })

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
