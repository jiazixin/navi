import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationProvider } from '../../app/NotificationProvider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getSession } from '../../app/api/auth'
import type * as AuthModule from '../../app/api/auth'
import { mockBrowserLocation } from '../../test/browserLocation'
import { AppearanceProvider } from '../../app/appearance/AppearanceProvider'
import { LoginPage } from './LoginPage'

function renderLogin(page: React.JSX.Element) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <NotificationProvider>
        <AppearanceProvider configuredPattern="contour" configuredTheme="default">
          {page}
        </AppearanceProvider>
      </NotificationProvider>
    </QueryClientProvider>,
  )
}

vi.mock('../../app/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  getSession: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fillCredentials(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('账号'), 'navi-user')
  await user.type(screen.getByLabelText('密码'), 'test-password')
}

describe('LoginPage', () => {
  it('enters the catalog after confirming that the login cookie is accepted', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })),
    )
    vi.mocked(getSession).mockResolvedValue({ authenticated: true, auth_required: true })
    const location = mockBrowserLocation('/login')
    renderLogin(<LoginPage />)
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: '登录并进入' }))
    await waitFor(() => expect(location.replace).toHaveBeenCalledWith('/'))
    expect(getSession).toHaveBeenCalledOnce()
  })

  it('supports password visibility without changing the credential value', async () => {
    const user = userEvent.setup()
    renderLogin(<LoginPage />)
    const password = screen.getByLabelText('密码')
    await user.type(password, 'secret')
    await user.click(screen.getByRole('button', { name: '显示密码' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('secret')
    await user.click(screen.getByRole('button', { name: '隐藏密码' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it.each([
    [401, 'invalid_credentials', '账号或密码不正确，请重新输入。'],
    [429, 'rate_limited', '尝试次数过多，请一分钟后重试。'],
    [503, 'sessions_full', '会话已满，请稍后重试。'],
    [500, 'internal', '暂时无法登录，请稍后重试。'],
  ])('reports HTTP %i %s and allows the user to retry', async (status, code, message) => {
    const user = userEvent.setup()
    const body = JSON.stringify({ error: { code, message: 'server text' } })
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }))
    vi.stubGlobal('fetch', request)
    renderLogin(<LoginPage />)
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: '登录并进入' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: '登录并进入' })).toBeEnabled()
    expect(request).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'navi-user', password: 'test-password' }),
      }),
    )
    expect(getSession).not.toHaveBeenCalled()
  })

  it('reports network failure and restores the submit control', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    renderLogin(<LoginPage />)
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: '登录并进入' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('连接失败，请检查网络后重试。')
    expect(screen.getByRole('button', { name: '登录并进入' })).toBeEnabled()
  })

  it('reports an accepted login whose cookie was rejected by the browser', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })),
    )
    vi.mocked(getSession).mockResolvedValue({ authenticated: false, auth_required: true })
    renderLogin(<LoginPage />)
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: '登录并进入' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法保存登录状态')
    expect(screen.getByRole('button', { name: '登录并进入' })).toBeEnabled()
  })

  it('prevents duplicate requests while one login is pending', async () => {
    const user = userEvent.setup()
    let completeRequest: ((response: Response) => void) | undefined
    const request = vi.fn<typeof fetch>().mockReturnValue(
      new Promise((resolve) => {
        completeRequest = resolve
      }),
    )
    vi.stubGlobal('fetch', request)
    renderLogin(<LoginPage />)
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: '登录并进入' }))
    expect(screen.getByRole('button', { name: '正在登录…' })).toBeDisabled()
    const form = screen.getByLabelText('账号').closest('form')
    if (form === null) throw new Error('Missing login form')
    // The disabled button stops a browser here; submit directly to cover the in-flight guard.
    fireEvent.submit(form)
    expect(request).toHaveBeenCalledOnce()
    completeRequest?.(new Response(null, { status: 401 }))
    await waitFor(() => expect(screen.getByRole('button', { name: '登录并进入' })).toBeEnabled())
  })

  it('offers a service retry without a credential form', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderLogin(<LoginPage isConnectionError onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: '重新连接' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
  })
})
