import { ApiError } from './api'
import { errorText } from './errors'
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Catalog } from './api/catalog'
import { catalogKeys, useCatalogData } from '../features/catalog/useCatalogData'
import { statusKeys, useStatusData } from '../features/status/useStatusData'
import { statusText } from './serverCodes'
import type { StatusBannerKind } from '../features/status/StatusBanner'
import { useCatalogEvents } from '../features/status/useCatalogEvents'

type BannerState = {
  kind: StatusBannerKind
  message: string
}

export function useCatalogState() {
  const queryClient = useQueryClient()
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null)
  const [faviconVersions, setFaviconVersions] = useState<Record<string, number>>({})

  const catalogQuery = useCatalogData()
  const statusQuery = useStatusData()

  const reconcileCatalog = useCallback((): void => {
    const cachedCatalog = queryClient.getQueryData<Catalog>(catalogKeys.snapshot())
    if (cachedCatalog !== undefined) {
      setFaviconVersions((currentVersions) => {
        const nextVersions: Record<string, number> = {}
        for (const page of cachedCatalog.pages) {
          for (const group of page.groups) {
            for (const link of group.links) {
              nextVersions[link.runtime_id] = (currentVersions[link.runtime_id] ?? 0) + 1
            }
          }
        }
        return nextVersions
      })
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: catalogKeys.snapshot() }),
      queryClient.invalidateQueries({ queryKey: statusKeys.health() }),
    ]).catch(() => {
      /* Query error state is rendered by the page. */
    })
  }, [queryClient])

  const refreshCatalog = useCallback((): void => {
    window.dispatchEvent(new Event('navi:retry-events'))
    reconcileCatalog()
  }, [reconcileCatalog])

  const refreshStatus = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: statusKeys.health() }).catch(() => {
      /* Query error state remains available for retry. */
    })
  }, [queryClient])

  const handleFaviconUpdate = useCallback((runtimeId: string): void => {
    setFaviconVersions((currentVersions) => ({
      ...currentVersions,
      ...(runtimeId.length <= 256 &&
      (Object.hasOwn(currentVersions, runtimeId) || Object.keys(currentVersions).length < 1000)
        ? { [runtimeId]: (currentVersions[runtimeId] ?? 0) + 1 }
        : {}),
    }))
  }, [])

  const connection = useCatalogEvents({
    onCatalogUpdate: reconcileCatalog,
    onStatusChange: refreshStatus,
    onFaviconUpdate: handleFaviconUpdate,
  })

  function getBanner(): BannerState | null {
    if (catalogQuery.isError && catalogQuery.data !== undefined) {
      return {
        kind: 'degraded',
        message: errorText(
          new ApiError('catalog refresh failed', {
            status: 0,
            code: 'catalog_refresh_failed',
            requestId: '',
          }),
          { catalog_refresh_failed: '目录刷新失败，当前仍显示最近一次有效内容。' },
        ),
      }
    }
    if (statusQuery.isError) {
      return { kind: 'degraded', message: errorText(statusQuery.error) }
    }
    if (statusQuery.data?.health === 'degraded') {
      return {
        kind: 'degraded',
        message: statusText(statusQuery.data.code) ?? '服务处于降级状态，导航仍可继续使用。',
      }
    }
    if (connection.kind === 'reconnecting') {
      return {
        kind: 'offline',
        message:
          connection.attempt > 2
            ? '实时更新暂时中断，请点击刷新重试。'
            : '实时更新暂时中断，正在后台重新连接。',
      }
    }
    return null
  }
  const banner = getBanner()

  const visibleBanner = banner !== null && banner.message !== dismissedBanner ? banner : null

  return {
    catalogQuery,
    statusQuery,
    faviconVersions,
    connection,
    refreshCatalog,
    visibleBanner,
    dismissBanner: setDismissedBanner,
  }
}
