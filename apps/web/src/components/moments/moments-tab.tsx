'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Moment } from '@milkpod/api/types';
import type { SyncedMoment } from '@milkpod/sync';
import { api } from '~/lib/api';
import { checkQuotaLocal, incrementMonthlyUsage } from '~/lib/plan-cache';
import { handleUpgradeError } from '~/lib/upgrade-prompt';
import { useReplicache } from '~/lib/replicache/context';
import {
  useRecentlyChanged,
  useSubscribedMoments,
} from '~/lib/replicache/hooks';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { MomentCard, type MomentAuthor } from './moment-card';
import {
  MomentPresetSwitcher,
  type MomentPreset,
} from './moment-preset-switcher';

interface MomentRow {
  moment: Moment;
  author?: MomentAuthor;
}

function syncedToRow(s: SyncedMoment): MomentRow {
  return {
    moment: syncedToMoment(s),
    author: {
      name: s.authorName,
      image: s.authorImage,
      email: s.authorEmail,
    },
  };
}

interface MomentsTabProps {
  assetId: string;
  initialMoments: Moment[];
}

function syncedToMoment(s: SyncedMoment): Moment {
  return {
    id: s.id,
    assetId: s.assetId,
    userId: s.authorId,
    preset: s.preset,
    title: s.title,
    rationale: s.rationale,
    startTime: s.startTime,
    endTime: s.endTime,
    score: s.score,
    scoreBreakdown: null,
    source: s.source,
    isSaved: s.isSaved,
    dismissedAt: null,
    deletedAt: null,
    rowVersion: s.rowVersion,
    createdAt: new Date(s.createdAt),
    updatedAt: null,
  };
}

export function MomentsTab({ assetId, initialMoments }: MomentsTabProps) {
  const [preset, setPreset] = useState<MomentPreset>('default');
  const [generating, setGenerating] = useState(false);

  const rep = useReplicache();
  const { items: syncedMoments, ready: syncReady } =
    useSubscribedMoments(assetId);
  const recentlyChanged = useRecentlyChanged(syncedMoments);

  // Replicache drives the list once its subscription has fired. The SSR
  // payload is only used in the brief window before that.
  const rows = useMemo<MomentRow[]>(() => {
    const source: MomentRow[] =
      rep && syncReady
        ? syncedMoments.map(syncedToRow)
        : initialMoments.map((moment) => ({ moment }));
    const filtered = source.filter((r) => r.moment.preset === preset);
    return filtered.sort((a, b) => b.moment.score - a.moment.score);
  }, [rep, syncReady, syncedMoments, initialMoments, preset]);

  async function handleGenerate(regenerate = false) {
    const quota = checkQuotaLocal('visual_segments');
    if (quota && !quota.allowed) {
      handleUpgradeError({ status: 402, value: { code: 'QUOTA_EXCEEDED' } });
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await api.api.moments.generate.post({
        assetId,
        preset,
        regenerate,
      });
      if (error) {
        if (handleUpgradeError(error)) return;
        throw new Error(String(error));
      }
      const generated = (data as Moment[]) ?? [];
      if (generated.length > 0) {
        incrementMonthlyUsage('visual_segments', generated.length);
      }
    } catch {
      toast.error('Failed to generate moments. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(momentId: string) {
    if (rep) {
      await rep.mutate.momentUpdate({
        id: momentId,
        assetId,
        isSaved: true,
      });
      return;
    }
    // Fallback for contexts outside the ReplicacheProvider.
    const { error } = await api.api
      .moments({ id: momentId })
      .feedback.post({ action: 'save' });
    if (error) throw new Error(String(error));
  }

  async function handleDismiss(momentId: string) {
    if (rep) {
      await rep.mutate.momentDelete({ id: momentId, assetId });
      return;
    }
    const { error } = await api.api
      .moments({ id: momentId })
      .feedback.post({ action: 'dismiss' });
    if (error) throw new Error(String(error));
  }

  const isEmpty = !generating && rows.length === 0;

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MomentPresetSwitcher
          value={preset}
          onChange={setPreset}
          disabled={generating}
        />
        {rows.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleGenerate(true)}
            disabled={generating}
          >
            {generating ? (
              <Spinner className="size-3" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Regenerate
          </Button>
        )}
      </div>

      {generating ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Spinner className="size-5" />
          <p className="text-sm text-muted-foreground">
            Extracting best moments...
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Sparkles className="size-8 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              No moments yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate highlights to find the best parts of this content.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => handleGenerate(false)}
            disabled={generating}
          >
            <Sparkles className="size-3" />
            Generate Moments
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ moment, author }, index) => (
            <div
              key={moment.id}
              className={cn(
                'animate-enter rounded-lg',
                recentlyChanged.has(moment.id) && 'sync-pulse',
              )}
              style={
                index > 0
                  ? { animationDelay: `${Math.min(index, 8) * 60}ms` }
                  : undefined
              }
            >
              <MomentCard
                moment={moment}
                author={author}
                onSave={handleSave}
                onDismiss={handleDismiss}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
