'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, FileText, MessageSquareText, Mic, User } from 'lucide-react';
import { ShareDialog } from '~/components/share/share-dialog';
import { toast } from 'sonner';
import { fetchAssetDetail } from '~/lib/api-fetchers';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { ChatPanel } from '~/components/chat/chat-panel';
import { TranscriptViewer } from './transcript-viewer';
import type {
  AssetWithTranscript,
  AssetStatus,
} from '@milkpod/api/types';
import { isProcessingStatus } from '@milkpod/api/types';
import { useAssetEvents, type AssetStatusEvent } from '~/hooks/use-asset-events';

interface AssetDetailProps {
  assetId: string;
}

type AssetData = AssetWithTranscript;

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching audio...',
  transcribing: 'Transcribing...',
  embedding: 'Embedding...',
  ready: 'Ready',
  failed: 'Failed',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AssetDetail({ assetId }: AssetDetailProps) {
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function fetchAsset() {
      setIsLoading(true);
      try {
        const result = await fetchAssetDetail(assetId);
        if (cancelled) return;

        if (!result) {
          setNotFound(true);
          return;
        }
        setAsset(result);
      } catch {
        if (!cancelled) {
          toast.error('Failed to load asset');
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAsset();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  // SSE: update status and progress in real-time
  useAssetEvents(
    useCallback(
      (event: AssetStatusEvent) => {
        if (event.assetId !== assetId) return;
        setAsset((prev) => (prev ? { ...prev, status: event.status } : prev));
        setProgressMessage(event.message);
        // Re-fetch full data (with transcript) when ready
        if (event.status === 'ready') {
          setProgressMessage(undefined);
          fetchAssetDetail(assetId)
            .then((result) => {
              if (result) setAsset(result);
            })
            .catch(() => {});
        }
        if (event.status === 'failed') {
          setProgressMessage(undefined);
        }
      },
      [assetId]
    )
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (notFound || !asset) {
    return (
      <div className="space-y-4">
        <BackButton />
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-sm text-muted-foreground">Asset not found</p>
          <Link href="/dashboard?tab=library">
            <Button variant="outline" size="sm">
              Back to library
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isReady = asset.status === 'ready';
  const speakers = new Set(
    asset.segments?.map((s) => s.speaker).filter((s): s is string => s != null)
  );

  return (
    <div className="space-y-4">
      {/* Header: back + share */}
      <div className="flex items-center justify-between">
        <BackButton />
        {isReady && (
          <ShareDialog assetId={assetId} resourceName={asset.title} />
        )}
      </div>

      {/* Asset info */}
      <div className="space-y-3">
        <div className="flex items-start gap-4">
          {asset.thumbnailUrl && (
            <div className="hidden shrink-0 overflow-hidden rounded-lg sm:block sm:w-40">
              <img
                src={asset.thumbnailUrl}
                alt={asset.title}
                className="aspect-video w-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-lg font-semibold text-foreground leading-tight">
              {asset.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {asset.channelName && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {asset.channelName}
                </span>
              )}
              {asset.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDuration(asset.duration)}
                </span>
              )}
              {speakers.size > 0 && (
                <span className="flex items-center gap-1">
                  <Mic className="size-3" />
                  {speakers.size} speaker{speakers.size > 1 ? 's' : ''}
                </span>
              )}
              <Badge
                variant={asset.status === 'failed' ? 'destructive' : 'outline'}
                className="text-xs"
              >
                {isProcessingStatus(asset.status) && (
                  <Spinner className="mr-1 size-3" />
                )}
                {progressMessage || statusLabels[asset.status] || asset.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main content: transcript + chat */}
      {isReady && asset.segments.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          {/* Transcript panel */}
          <DashboardPanel className="flex h-[calc(100svh-14rem)] min-h-[400px] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <FileText className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">
                Transcript
              </h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {asset.segments.length} segments
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <TranscriptViewer segments={asset.segments} />
            </div>
          </DashboardPanel>

          {/* Chat panel */}
          <DashboardPanel className="h-[calc(100svh-14rem)] min-h-[400px]">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <MessageSquareText className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">
                Ask AI
              </h2>
            </div>
            <ChatPanel assetId={assetId} />
          </DashboardPanel>
        </div>
      ) : isReady && asset.segments.length === 0 ? (
        <DashboardPanel>
          <DashboardPanelContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              Transcript is empty. The audio may not contain recognizable speech.
            </p>
          </DashboardPanelContent>
        </DashboardPanel>
      ) : (
        <DashboardPanel>
          <DashboardPanelContent>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              {isProcessingStatus(asset.status) && (
                <Spinner className="size-5" />
              )}
              <p className="text-sm text-muted-foreground">
                {asset.status === 'failed'
                  ? `Processing failed${asset.lastError ? `: ${asset.lastError}` : ''}`
                  : progressMessage || 'Transcript will appear here once processing completes.'}
              </p>
            </div>
          </DashboardPanelContent>
        </DashboardPanel>
      )}
    </div>
  );
}

function BackButton() {
  return (
    <Link
      href="/dashboard?tab=library"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to library
    </Link>
  );
}
