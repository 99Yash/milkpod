'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderPlus, Play } from 'lucide-react';
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
import { isProcessingStatus, STALE_ASSET_THRESHOLD_MS } from '@milkpod/api/types';
import { AddToCollectionDialog } from './add-to-collection-dialog';

interface AssetCardProps {
  asset: Asset;
  onSelect?: (assetId: string) => void;
  onRetry?: (assetId: string) => void;
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

function formatRetryErrorMessage(message: string): string {
  const normalized = message.replace(/https?:\/\/\S+/gi, '[link]').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Could not start retry. Please try again.';
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137)}...`;
}

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

  // Show retry for assets stuck in a processing state beyond the threshold
  const isStale =
    inProgress &&
    asset.updatedAt != null &&
    Date.now() - new Date(asset.updatedAt).getTime() > STALE_ASSET_THRESHOLD_MS;

  const overallProgress = computeOverallProgress(status, progress);
  const displayLabel = progressMessage || statusLabels[status] || status;

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    try {
      const { error } = await api.api.assets({ id: asset.id }).retry.post();
      if (error) {
        const errValue =
          typeof error === 'object' && error !== null && 'value' in error
            ? (error as { value?: unknown }).value
            : undefined;
        const msg =
          typeof errValue === 'object' && errValue !== null && 'message' in errValue
            ? formatRetryErrorMessage(String((errValue as { message: string }).message))
            : 'Could not start retry. Please try again.';
        toast.error(msg);
        return;
      }
      toast.success('Retry started');
      onRetry?.(asset.id);
    } catch {
      toast.error('Could not start retry. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  const card = (
    <DashboardPanel
      className={cn(
        'flex h-full flex-col transition',
        isReady && 'cursor-pointer hover:-translate-y-0.5 card-hover'
      )}
    >
      <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            className="h-full w-full object-cover image-inset-outline"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Play className="size-8 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <DashboardPanelContent className="flex flex-1 flex-col space-y-2">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {asset.title}
        </p>
        {isFailed && asset.lastError && (
          <p className="text-xs text-destructive line-clamp-2">{asset.lastError}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2">
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
                className="h-6 w-6 p-0 text-muted-foreground"
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
            {(isFailed || isStale) && (
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2.5 text-xs"
                onClick={handleRetry}
                disabled={retrying}
                aria-label={`Retry processing ${asset.title}`}
              >
                {retrying ? <Spinner className="size-3 mr-1" /> : null}
                {retrying ? 'Retrying...' : 'Retry'}
              </Button>
            )}
            {inProgress && !isStale && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                {displayLabel}
              </span>
            )}
            {isStale && (
              <span className="text-xs text-destructive">Stuck</span>
            )}
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
        <Link href={route(`/asset/${asset.id}`)} className="h-full">{card}</Link>
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
