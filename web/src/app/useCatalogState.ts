import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCatalog, type Catalog } from './api/catalog';
import { getServiceStatus } from './api/status';
import type { StatusBannerKind } from '../features/status/StatusBanner';
import { useCatalogEvents } from '../features/status/useCatalogEvents';

type BannerState = {
  kind: StatusBannerKind;
  message: string;
};

export function useCatalogState() {
  const queryClient = useQueryClient();
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);
  const [faviconVersions, setFaviconVersions] = useState<Record<string, number>>({});

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => getCatalog(signal),
  });
  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => getServiceStatus(signal),
    retry: 1,
  });

  const refreshCatalog = useCallback((): void => {
    const cachedCatalog = queryClient.getQueryData<Catalog>(['catalog']);
    if (cachedCatalog !== undefined) {
      setFaviconVersions((currentVersions) => {
        const nextVersions: Record<string, number> = {};
        for (const page of cachedCatalog.pages) {
          for (const group of page.groups) {
            for (const link of group.links) {
              nextVersions[link.runtimeId] = (currentVersions[link.runtimeId] ?? 0) + 1;
            }
          }
        }
        return nextVersions;
      });
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['status'] }),
    ]);
  }, [queryClient]);

  const refreshStatus = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['status'] });
  }, [queryClient]);

  const handleFaviconUpdate = useCallback((runtimeId: string): void => {
    setFaviconVersions((currentVersions) => ({
      ...currentVersions,
      [runtimeId]: (currentVersions[runtimeId] ?? 0) + 1,
    }));
  }, []);

  const connection = useCatalogEvents({
    onCatalogUpdate: refreshCatalog,
    onStatusChange: refreshStatus,
    onFaviconUpdate: handleFaviconUpdate,
  });

  const banner = useMemo<BannerState | null>(() => {
    if (catalogQuery.isError && catalogQuery.data !== undefined) {
      return { kind: 'degraded', message: '目录刷新失败，当前仍显示最近一次有效内容。' };
    }
    if (statusQuery.data?.health === 'degraded') {
      return {
        kind: 'degraded',
        message: statusQuery.data.message ?? '服务处于降级状态，导航仍可继续使用。',
      };
    }
    if (connection.kind === 'reconnecting') {
      return { kind: 'offline', message: '实时更新暂时中断，正在后台重新连接。' };
    }
    return null;
  }, [catalogQuery.data, catalogQuery.isError, connection.kind, statusQuery.data]);

  const visibleBanner = banner !== null && banner.message !== dismissedBanner ? banner : null;

  return {
    catalogQuery,
    statusQuery,
    faviconVersions,
    connection,
    refreshCatalog,
    visibleBanner,
    dismissBanner: setDismissedBanner,
  };
}
