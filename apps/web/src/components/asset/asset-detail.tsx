'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  FileText,
  MessageSquareText,
  Mic,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareDialog } from '~/components/share/share-dialog';
import { fetchAssetDetail } from '~/lib/api-fetchers';
import { formatDuration } from '~/lib/format';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { ChatPanel } from '~/components/chat/chat-panel';
import { TranscriptViewer } from './transcript-viewer';
import type { AssetWithTranscript, AssetStatus } from '@milkpod/api/types';
import { isProcessingStatus } from '@milkpod/api/types';
import {
  useAssetEvents,
  type AssetStatusEvent,
} from '~/hooks/use-asset-events';

interface AssetDetailProps {
  assetId: string;
  initialAsset: AssetWithTranscript;
}

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching audio...',
  transcribing: 'Transcribing...',
  embedding: 'Embedding...',
  ready: 'Ready',
  failed: 'Failed',
};

export function AssetDetail({ assetId, initialAsset }: AssetDetailProps) {
  const [asset, setAsset] = useState<AssetWithTranscript>(initialAsset);
  const [progressMessage, setProgressMessage] = useState<
    string | undefined
  >();

  // SSE: update status and progress in real-time
  useAssetEvents(
    useCallback(
      (event: AssetStatusEvent) => {
        if (event.assetId !== assetId) return;
        setAsset((prev) => ({ ...prev, status: event.status }));
        setProgressMessage(event.message);
        // Re-fetch full data (with transcript) when ready
        if (event.status === 'ready') {
          setProgressMessage(undefined);
          fetchAssetDetail(assetId)
            .then((result) => {
              if (result) setAsset(result);
            })
            .catch(() => {
              toast.error('Failed to refresh asset details');
            });
        }
        if (event.status === 'failed') {
          setProgressMessage(undefined);
        }
      },
      [assetId]
    )
  );

  const isReady = asset.status === 'ready';
  const speakers = useMemo(
    () =>
      new Set(
        asset.segments
          ?.map((s) => s.speaker)
          .filter((s): s is string => s != null),
      ),
    [asset.segments],
  );

  return (
    <div className="flex flex-col lg:h-[calc(100svh-6rem-2px)]">
      {/* Compact header */}
      <div className="shrink-0 space-y-2 pb-3">
        {/* Row 1: nav + title + actions */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="h-5 w-px bg-border" />
          {asset.thumbnailUrl && (
            <img
              src={asset.thumbnailUrl}
              alt="Video thumbnail"
              className="hidden h-10 w-auto shrink-0 rounded-md object-cover sm:block"
            />
          )}
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {asset.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={asset.status === 'failed' ? 'destructive' : 'outline'}
              className="text-xs"
            >
              {isProcessingStatus(asset.status) && (
                <Spinner className="mr-1 size-3" />
              )}
              {progressMessage || statusLabels[asset.status] || asset.status}
            </Badge>
            {isReady && (
              <ShareDialog assetId={assetId} resourceName={asset.title} />
            )}
          </div>
        </div>

        {/* Row 2: metadata chips — left padding aligns with title (back btn + gap + divider) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[calc(theme(spacing.4)+theme(spacing.3)+1px)] text-xs text-muted-foreground">
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
        </div>
      </div>

      {/* Main content: transcript + chat */}
      {isReady && asset.segments.length > 0 ? (
        <div className="grid min-h-[500px] flex-1 gap-4 lg:min-h-0 lg:grid-cols-[1fr_400px]">
          {/* Transcript panel */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/40">
            <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
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
          </div>

          {/* Chat panel */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/40">
            <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
              <MessageSquareText className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Ask AI</h2>
            </div>
            <ChatPanel assetId={assetId} />
          </div>
        </div>
      ) : isReady && asset.segments.length === 0 ? (
        <DashboardPanel>
          <DashboardPanelContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              Transcript is empty. The audio may not contain recognizable
              speech.
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
                  : progressMessage ||
                    'Transcript will appear here once processing completes.'}
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
      className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      <span className="sr-only sm:not-sr-only">Library</span>
    </Link>
  );
}
