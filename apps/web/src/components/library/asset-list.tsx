'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchAssets } from '~/lib/api-fetchers';
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
  const [assets, setAssets] = useState<Asset[]>(initialAssets ?? []);
  const [isLoading, setIsLoading] = useState(!initialAssets);
  const [progressMap, setProgressMap] = useState<Record<string, AssetProgress>>({});

  const loadAssets = useCallback(async () => {
    try {
      const query: Record<string, string> = {};
      if (filters?.q) query.q = filters.q;
      if (filters?.status) query.status = filters.status;
      if (filters?.sourceType) query.sourceType = filters.sourceType;

      const data = await fetchAssets(query);
      setAssets(data);
    } catch {
      // silent — toast handled by query cache
    } finally {
      setIsLoading(false);
    }
  }, [filters?.q, filters?.status, filters?.sourceType]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets, refreshKey]);

  // SSE: update asset status and progress in real-time
  // Falls back to polling loadAssets() if SSE permanently fails
  useAssetEvents(
    useCallback(
      (event: AssetStatusEvent) => {
        setAssets((prev) =>
          prev.map((a) =>
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
        // Re-fetch full data when asset becomes ready
        if (event.status === 'ready' || event.status === 'failed') {
          // Clean up progress for terminal states
          setProgressMap((prev) => {
            const next = { ...prev };
            delete next[event.assetId];
            return next;
          });
          if (event.status === 'ready') {
            loadAssets();
          }
        }
      },
      [loadAssets]
    ),
    { onPollFallback: loadAssets }
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
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onSelect={onSelectAsset}
          onRetry={loadAssets}
          progress={progressMap[asset.id]?.progress}
          progressMessage={progressMap[asset.id]?.message}
        />
      ))}
    </div>
  );
}
