'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { fetchAssetsPage, type AssetPageResult } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import { AssetCard } from './asset-card';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useAssetEvents, type AssetStatusEvent } from '~/hooks/use-asset-events';
import type { AssetFilters } from './search-filter-bar';

interface AssetListProps {
  onSelectAsset?: (assetId: string) => void;
  refreshKey?: number;
  filters?: AssetFilters;
}

/** Per-asset progress info from SSE events */
interface AssetProgress {
  progress?: number;
  message?: string;
}

const PAGE_SIZE = 12;

export function AssetList({ onSelectAsset, refreshKey, filters }: AssetListProps) {
  const queryClient = useQueryClient();
  const [progressMap, setProgressMap] = useState<Record<string, AssetProgress>>({});

  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (filters?.q) q.q = filters.q;
    if (filters?.status) q.status = filters.status;
    if (filters?.sourceType) q.sourceType = filters.sourceType;
    return q;
  }, [filters?.q, filters?.status, filters?.sourceType]);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.assets.page(query),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchAssetsPage({
        q: query.q,
        status: query.status,
        sourceType: query.sourceType,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const assets = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // Handle refreshKey from parent (skip initial mount)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    refetch();
  }, [refreshKey, refetch]);

  // Toast on fetch error
  useEffect(() => {
    if (isError) {
      toast.error('Failed to load assets. Check your connection and try again.');
    }
  }, [isError]);

  // SSE: update asset status and progress in real-time
  // Falls back to polling via query invalidation if SSE permanently fails
  useAssetEvents(
    useCallback(
      (event: AssetStatusEvent) => {
        // Optimistic status update across all cached asset lists
        queryClient.setQueriesData<InfiniteData<AssetPageResult>>(
          { queryKey: queryKeys.assets.pages() },
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              pages: prev.pages.map((page) => ({
                ...page,
                items: page.items.map((a) =>
                  a.id === event.assetId ? { ...a, status: event.status } : a,
                ),
              })),
            };
          },
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

  const handleRetry = useCallback(
    (assetId: string) => {
      const statusFilter = (query.status ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const shouldKeepInCurrentList =
        statusFilter.length === 0 ||
        statusFilter.includes('queued') ||
        statusFilter.includes('fetching') ||
        statusFilter.includes('transcribing') ||
        statusFilter.includes('embedding');

      setProgressMap((prev) => ({
        ...prev,
        [assetId]: {
          progress: 0,
          message: 'Retrying...',
        },
      }));

      queryClient.setQueryData<InfiniteData<AssetPageResult>>(
        queryKeys.assets.page(query),
        (prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: shouldKeepInCurrentList
                ? page.items.map((item) =>
                    item.id === assetId
                      ? {
                          ...item,
                          status: 'queued',
                          attempts: 0,
                          lastError: null,
                        }
                      : item,
                  )
                : page.items.filter((item) => item.id !== assetId),
            })),
          };
        },
      );
    },
    [query.status, query, queryClient],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Failed to load assets</p>
          <p className="text-sm text-muted-foreground">
            Something went wrong. Check your connection and try again.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Spinner className="size-4" /> : null}
          {isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No media yet. Paste a URL above or upload a file to get started.
      </p>
    );
  }

  return (
    <div className="space-y-4">
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
              onRetry={handleRetry}
              progress={progressMap[asset.id]?.progress}
              progressMessage={progressMap[asset.id]?.message}
            />
          </div>
        ))}
      </div>

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner className="size-4" /> : null}
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
