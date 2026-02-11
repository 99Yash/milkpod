'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '~/lib/api';
import { AssetCard } from './asset-card';
import { Spinner } from '~/components/ui/spinner';
import type { Asset, AssetStatus } from '@milkpod/api/types';
import { useAssetEvents } from '~/hooks/use-asset-events';

interface AssetListProps {
  onSelectAsset?: (assetId: string) => void;
  refreshKey?: number;
}

export function AssetList({ onSelectAsset, refreshKey }: AssetListProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // SSE: update asset status in real-time
  useAssetEvents(
    useCallback(
      (assetId: string, status: AssetStatus) => {
        setAssets((prev) =>
          prev.map((a) => (a.id === assetId ? { ...a, status } : a))
        );
        // Re-fetch full data when asset becomes ready
        if (status === 'ready') {
          fetchAssets();
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
        <AssetCard key={asset.id} asset={asset} onSelect={onSelectAsset} onRetry={fetchAssets} />
      ))}
    </div>
  );
}
