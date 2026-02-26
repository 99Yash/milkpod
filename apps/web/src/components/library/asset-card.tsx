'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderPlus } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { route } from '~/lib/routes';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { cn } from '~/lib/utils';
import { api } from '~/lib/api';
import { toast } from 'sonner';
import type { Asset, AssetStatus } from '@milkpod/api/types';
import { isProcessingStatus } from '@milkpod/api/types';
import { AddToCollectionDialog } from './add-to-collection-dialog';

interface AssetCardProps {
  asset: Asset;
  onSelect?: (assetId: string) => void;
  onRetry?: () => void;
  /** Real-time progress (0–100) from SSE, if available */
  progress?: number;
  /** Human-readable progress message from SSE */
  progressMessage?: string;
}

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching audio...',
  transcribing: 'Transcribing...',
  embedding: 'Embedding...',
  ready: 'Ready',
  failed: 'Failed',
};

/** Fallback progress when no SSE progress is available */
const statusProgressFallback: Record<AssetStatus, number> = {
  queued: 5,
  fetching: 15,
  transcribing: 40,
  embedding: 70,
  ready: 100,
  failed: 0,
};

/**
 * Maps SSE sub-stage progress (0-100 within a stage) to overall progress.
 * Each stage occupies a portion of the 0-100 range:
 *   fetching: 5–25, transcribing: 25–60, embedding: 60–95
 */
function computeOverallProgress(status: AssetStatus, stageProgress?: number): number {
  if (status === 'ready') return 100;
  if (status === 'failed') return 0;
  if (stageProgress === undefined) return statusProgressFallback[status];

  const ranges: Partial<Record<AssetStatus, [number, number]>> = {
    fetching: [5, 25],
    transcribing: [25, 60],
    embedding: [60, 95],
  };
  const range = ranges[status];
  if (!range) return statusProgressFallback[status];

  const [min, max] = range;
  return Math.round(min + ((max - min) * stageProgress) / 100);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AssetCard({
  asset,
  onSelect,
  onRetry,
  progress,
  progressMessage,
}: AssetCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const { status } = asset;
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const inProgress = isProcessingStatus(status);

  const overallProgress = computeOverallProgress(status, progress);
  const displayLabel = progressMessage || statusLabels[status] || status;

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    try {
      const { error } = await api.api.assets({ id: asset.id }).retry.post();
      if (error) {
        const msg =
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: string }).message)
            : 'Retry failed';
        toast.error(msg);
        return;
      }
      onRetry?.();
    } finally {
      setRetrying(false);
    }
  };

  const card = (
    <DashboardPanel
      className={cn(
        'transition',
        isReady && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
      )}
    >
      {asset.thumbnailUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <DashboardPanelContent className="space-y-2">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {asset.title}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate">
            {asset.channelName ?? ''}
            {asset.channelName && asset.duration ? ' · ' : ''}
            {asset.duration ? formatDuration(asset.duration) : ''}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isReady && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCollectionDialogOpen(true);
                }}
                title="Add to collection"
              >
                <FolderPlus className="size-3.5" />
              </Button>
            )}
            {isFailed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? <Spinner className="size-3" /> : 'Retry'}
              </Button>
            )}
            <Badge
              variant={isFailed ? 'destructive' : 'outline'}
              className={cn(
                'text-xs',
                !isFailed && 'border-border/60'
              )}
            >
              {inProgress && <Spinner className="size-3 mr-1" />}
              {displayLabel}
            </Badge>
          </div>
        </div>
      </DashboardPanelContent>
      {inProgress && (
        <div className="h-1 w-full overflow-hidden bg-muted">
          <div
            className="h-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}
    </DashboardPanel>
  );

  return (
    <>
      {isReady ? (
        <Link href={route(`/asset/${asset.id}`)}>{card}</Link>
      ) : (
        card
      )}
      <AddToCollectionDialog
        assetId={asset.id}
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
      />
    </>
  );
}
