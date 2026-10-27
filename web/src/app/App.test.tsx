import { NotificationProvider } from './NotificationProvider'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { catalogFixture } from '../../tests/fixtures/catalog'
import { AppearanceProvider } from './appearance/AppearanceProvider'
import { AuthRequiredContext } from './AuthContext'
import { useCatalogEvents } from '../features/status/useCatalogEvents'
import { getCatalog } from './api/catalog'
import { getServiceStatus } from './api/status'
import { App } from './App'

vi.mock('./api/catalog', () => ({ getCatalog: vi.fn() }))
vi.mock('./api/status', () => ({ getServiceStatus: vi.fn() }))
vi.mock('../features/status/useCatalogEvents', () => ({ useCatalogEvents: vi.fn() }))

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AppearanceProvider configuredPattern="contour" configuredTheme="ink">
          <AuthRequiredContext value={false}>
            <App configuredSearch="google" />
          </AuthRequiredContext>
        </AppearanceProvider>
      </NotificationProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.mocked(getCatalog).mockResolvedValue(catalogFixture)
  vi.mocked(getServiceStatus).mockResolvedValue({ health: 'ok', revision: 1 })
  vi.mocked(useCatalogEvents).mockReturnValue({ kind: 'live' })
})

describe('App', () => {
  it('shows the loading skeleton, then the hero and the current page', async () => {
    renderApp()
    expect(screen.getByRole('status', { name: '正在加载目录' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '打开 Grafana' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '我的导航' })).toBeInTheDocument()
    expect(document.title).toBe('我的导航 · Navi')
    expect(screen.getByRole('link', { name: '目录 · 2 个分区 · 2 个链接' })).toHaveAttribute(
      'href',
      '#catalog',
    )
    expect(screen.getByText('等高线')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument()
  })

  it('switches pages and remembers the selection', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('link', { name: '打开 Grafana' })
    await user.click(screen.getByRole('button', { name: '灵感收藏' }))
    expect(await screen.findByRole('heading', { level: 2, name: '收藏' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '打开 Grafana' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('navi.page')).toBe('page2')
    expect(document.title).toBe('灵感收藏 · Navi')
  })

  it('opens quick search with Cmd+K, focuses the hero with slash and toggles appearance', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('link', { name: '打开 Grafana' })

    await user.keyboard('{Meta>}k{/Meta}')
    const dialog = screen.getByRole('dialog', { name: '搜索链接' })
    expect(within(dialog).getByRole('combobox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '搜索链接' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索链接' })).toHaveFocus()

    await user.keyboard('/')
    expect(screen.getByRole('combobox', { name: '搜索网页或筛选链接' })).toHaveFocus()
    await user.keyboard('/')
    expect(screen.getByRole('combobox', { name: '搜索网页或筛选链接' })).toHaveValue('/')

    await user.click(screen.getByRole('button', { name: '搜索链接' }))
    expect(screen.getByRole('dialog', { name: '搜索链接' })).toBeInTheDocument()
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.queryByRole('dialog', { name: '搜索链接' })).not.toBeInTheDocument()

    const appearance = screen.getByRole('button', { name: '外观：纹样与色调' })
    await user.click(appearance)
    expect(screen.getByRole('dialog', { name: '外观' })).toBeInTheDocument()
    expect(appearance).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '外观' })).not.toBeInTheDocument()
    expect(appearance).toHaveFocus()
  })

  it('offers a retry when the catalog cannot load', async () => {
    const user = userEvent.setup()
    vi.mocked(getCatalog).mockRejectedValueOnce(new Error('offline'))
    renderApp()
    const retry = await screen.findByRole('button', { name: '重新加载' })
    expect(screen.getByRole('heading', { name: '目录暂时无法加载' })).toBeInTheDocument()
    await user.click(retry)
    expect(await screen.findByRole('link', { name: '打开 Grafana' })).toBeInTheDocument()
  })

  it('shows an empty state and the degraded banner', async () => {
    const user = userEvent.setup()
    vi.mocked(getCatalog).mockResolvedValue({
      revision: 2,
      pages: [{ id: 'empty', title: '空页', groups: [] }],
    })
    vi.mocked(getServiceStatus).mockResolvedValue({
      health: 'degraded',
      revision: 2,
      code: 'catalog_reload_failed',
      message: 'catalog reload failed',
    })
    renderApp()
    expect(await screen.findByRole('heading', { name: '目录还是空的' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '目录更新失败，当前仍显示最近一次有效内容。',
    )
    await user.click(screen.getByRole('button', { name: '关闭提示' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
