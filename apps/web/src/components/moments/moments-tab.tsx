'use client';

import { useCallback, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { Moment } from '@milkpod/api/types';
import { api } from '~/lib/api';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { MomentCard } from './moment-card';
import {
  MomentPresetSwitcher,
  type MomentPreset,
} from './moment-preset-switcher';

interface MomentsTabProps {
  assetId: string;
  initialMoments: Moment[];
}

export function MomentsTab({ assetId, initialMoments }: MomentsTabProps) {
  const [preset, setPreset] = useState<MomentPreset>('default');
  const [moments, setMoments] = useState<Moment[]>(initialMoments);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(true);

  const fetchMoments = useCallback(
    async (p: MomentPreset) => {
      setLoading(true);
      try {
        const { data, error } = await api.api.moments.get({
          query: { assetId, preset: p },
        });
        if (error) throw new Error(String(error));
        setMoments((data as Moment[]) ?? []);
      } catch {
        // Error is surfaced by the global query cache error handler
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [assetId],
  );

  async function handleGenerate(regenerate = false) {
    setGenerating(true);
    try {
      const { data, error } = await api.api.moments.generate.post({
        assetId,
        preset,
        regenerate,
      });
      if (error) throw new Error(String(error));
      setMoments((data as Moment[]) ?? []);
    } catch {
      // Error handled by global handler
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(momentId: string) {
    const { error } = await api.api.moments({ id: momentId }).feedback.post({
      action: 'save',
    });
    if (!error) {
      setMoments((prev) =>
        prev.map((m) => (m.id === momentId ? { ...m, isSaved: true } : m)),
      );
    }
  }

  async function handleDismiss(momentId: string) {
    const { error } = await api.api.moments({ id: momentId }).feedback.post({
      action: 'dismiss',
    });
    if (!error) {
      setMoments((prev) => prev.filter((m) => m.id !== momentId));
    }
  }

  function handlePresetChange(p: MomentPreset) {
    setPreset(p);
    setHasLoaded(false);
    fetchMoments(p);
  }

  const isEmpty = hasLoaded && !loading && moments.length === 0;

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Header row: preset switcher + regenerate */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MomentPresetSwitcher
          value={preset}
          onChange={handlePresetChange}
          disabled={generating}
        />
        {moments.length > 0 && (
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

      {/* Content */}
      {loading || generating ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Spinner className="size-5" />
          <p className="text-sm text-muted-foreground">
            {generating
              ? 'Extracting best moments...'
              : 'Loading moments...'}
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
          {moments.map((moment, index) => (
            <div
              key={moment.id}
              className="animate-enter"
              style={index > 0 ? { animationDelay: `${Math.min(index, 8) * 60}ms` } : undefined}
            >
              <MomentCard
                moment={moment}
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
