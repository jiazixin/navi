import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { catalogFixture } from '../../tests/fixtures/catalog'
import { getCatalog } from './api/catalog'
import { getServiceStatus } from './api/status'
import { useCatalogEvents } from '../features/status/useCatalogEvents'
import { useCatalogState } from './useCatalogState'

vi.mock('./api/catalog', () => ({ getCatalog: vi.fn() }))
vi.mock('./api/status', () => ({ getServiceStatus: vi.fn() }))
vi.mock('../features/status/useCatalogEvents', () => ({ useCatalogEvents: vi.fn() }))

function renderCatalogState() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return renderHook(() => useCatalogState(), { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCatalog).mockResolvedValue(catalogFixture)
  vi.mocked(getServiceStatus).mockResolvedValue({ health: 'ok', revision: 1 })
  vi.mocked(useCatalogEvents).mockReturnValue({ kind: 'live' })
})

describe('catalog synchronization', () => {
  it('updates one favicon for an event and refreshes all active icons on reconciliation', async () => {
    const { result } = renderCatalogState()
    await waitFor(() => expect(result.current.catalogQuery.isSuccess).toBe(true))
    const eventHandlers = vi.mocked(useCatalogEvents).mock.calls.at(-1)?.[0]
    if (eventHandlers === undefined) throw new Error('Missing catalog event subscription')
    act(() => {
      eventHandlers.onFaviconUpdate?.('grafana')
      eventHandlers.onFaviconUpdate?.('removed-link')
    })
    expect(result.current.faviconVersions).toEqual({ grafana: 1, 'removed-link': 1 })

    act(() => result.current.refreshCatalog())
    await waitFor(() => expect(getCatalog).toHaveBeenCalledTimes(2))
    expect(result.current.faviconVersions).toEqual({ grafana: 2, github: 1, 'github-page2': 1 })
    await waitFor(() => expect(getServiceStatus).toHaveBeenCalledTimes(2))
  })

  it('keeps cached content and reports a failed background refresh', async () => {
    const { result } = renderCatalogState()
    await waitFor(() => expect(result.current.catalogQuery.isSuccess).toBe(true))
    vi.mocked(getCatalog).mockRejectedValue(new Error('offline'))
    act(() => result.current.refreshCatalog())
    await waitFor(() => expect(result.current.catalogQuery.isError).toBe(true))
    expect(result.current.catalogQuery.data).toEqual(catalogFixture)
    expect(result.current.visibleBanner?.message).toBe('目录刷新失败，当前仍显示最近一次有效内容。')
  })

  it('dismisses the current warning while allowing a different warning to appear', async () => {
    vi.mocked(getServiceStatus).mockResolvedValue({
      health: 'degraded',
      revision: 1,
      code: 'icon_cache_write_failed',
      message: 'icon cache writes failed',
    })
    const { result, rerender } = renderCatalogState()
    await waitFor(() =>
      expect(result.current.visibleBanner?.message).toBe(
        '图标缓存写入失败，当前保留已有图标或使用字标。请检查存储权限和磁盘空间。',
      ),
    )
    act(() =>
      result.current.dismissBanner(
        '图标缓存写入失败，当前保留已有图标或使用字标。请检查存储权限和磁盘空间。',
      ),
    )
    expect(result.current.visibleBanner).toBeNull()

    vi.mocked(getServiceStatus).mockResolvedValue({ health: 'ok', revision: 1 })
    vi.mocked(useCatalogEvents).mockReturnValue({ kind: 'reconnecting', attempt: 1 })
    act(() => result.current.refreshCatalog())
    rerender()
    await waitFor(() => expect(result.current.visibleBanner?.kind).toBe('offline'))
  })
})
