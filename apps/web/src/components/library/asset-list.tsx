'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAssets } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import { AssetCard } from './asset-card';
import { Spinner } from '~/components/ui/spinner';
import type { Asset } from '@milkpod/api/types';
import { useAssetEvents, type AssetStatusEvent } from '~/hooks/use-asset-events';
import type { AssetFilters } from './search-filter-bar';

interface AssetListProps {
  onSelectAsset?: (assetId: string) => void;
  refreshKey?: number;
  filters?: AssetFilters;
  initialAssets?: Asset[];
}

/** Per-asset progress info from SSE events */
interface AssetProgress {
  progress?: number;
  message?: string;
}

export function AssetList({ onSelectAsset, refreshKey, filters, initialAssets }: AssetListProps) {
  const queryClient = useQueryClient();
  const [progressMap, setProgressMap] = useState<Record<string, AssetProgress>>({});

  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (filters?.q) q.q = filters.q;
    if (filters?.status) q.status = filters.status;
    if (filters?.sourceType) q.sourceType = filters.sourceType;
    return q;
  }, [filters?.q, filters?.status, filters?.sourceType]);

  const hasActiveFilters = Boolean(
    filters?.q || filters?.status || filters?.sourceType,
  );

  const { data: assets = [], isLoading, refetch } = useQuery({
    queryKey: queryKeys.assets.list(query),
    queryFn: () => fetchAssets(query),
    initialData: hasActiveFilters ? undefined : initialAssets,
    initialDataUpdatedAt: initialAssets ? Date.now() : undefined,
  });

  // Handle refreshKey from parent (skip initial mount)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    refetch();
  }, [refreshKey, refetch]);

  // SSE: update asset status and progress in real-time
  // Falls back to polling via query invalidation if SSE permanently fails
  useAssetEvents(
    useCallback(
      (event: AssetStatusEvent) => {
        // Optimistic status update across all cached asset lists
        queryClient.setQueriesData<Asset[]>(
          { queryKey: queryKeys.assets.lists() },
          (prev) =>
            prev?.map((a) =>
              a.id === event.assetId ? { ...a, status: event.status } : a
            )
        );
        setProgressMap((prev) => ({
          ...prev,
          [event.assetId]: {
            progress: event.progress,
            message: event.message,
          },
        }));
        // Re-fetch full data when asset reaches terminal state
        if (event.status === 'ready' || event.status === 'failed') {
          setProgressMap((prev) => {
            const next = { ...prev };
            delete next[event.assetId];
            return next;
          });
          if (event.status === 'ready') {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
          }
        }
      },
      [queryClient]
    ),
    {
      onPollFallback: useCallback(
        () => { queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }); },
        [queryClient]
      ),
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No videos yet. Paste a YouTube URL above to get started.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset, index) => (
        <div
          key={asset.id}
          className="animate-enter"
          style={index > 0 ? { animationDelay: `${Math.min(index, 8) * 60}ms` } : undefined}
        >
          <AssetCard
            asset={asset}
            onSelect={onSelectAsset}
            onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.assets.all })}
            progress={progressMap[asset.id]?.progress}
            progressMessage={progressMap[asset.id]?.message}
          />
        </div>
      ))}
    </div>
  );
}
