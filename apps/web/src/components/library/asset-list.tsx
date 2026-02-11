'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '~/lib/api';
import { AssetCard } from './asset-card';
import { Spinner } from '~/components/ui/spinner';
import type { Asset } from '@milkpod/api/types';
import { useAssetEvents, type AssetStatusEvent } from '~/hooks/use-asset-events';

interface AssetListProps {
  onSelectAsset?: (assetId: string) => void;
  refreshKey?: number;
}

/** Per-asset progress info from SSE events */
interface AssetProgress {
  progress?: number;
  message?: string;
}

export function AssetList({ onSelectAsset, refreshKey }: AssetListProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, AssetProgress>>({});

  const fetchAssets = useCallback(async () => {
    try {
      const { data } = await api.api.assets.get();
      if (data && Array.isArray(data)) {
        setAssets(data as Asset[]);
      }
    } catch {
      // silent — toast handled by query cache
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets, refreshKey]);

  // SSE: update asset status and progress in real-time
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
            fetchAssets();
          }
        }
      },
      [fetchAssets]
    )
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
          onRetry={fetchAssets}
          progress={progressMap[asset.id]?.progress}
          progressMessage={progressMap[asset.id]?.message}
        />
      ))}
    </div>
  );
}
