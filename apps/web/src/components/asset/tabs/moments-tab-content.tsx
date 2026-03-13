'use client';

import { useEffect, useRef, useState } from 'react';
import type { Moment } from '@milkpod/api/types';
import { api } from '~/lib/api';
import { MomentsTab } from '~/components/moments/moments-tab';
import { MomentsTabSkeleton } from '~/components/asset/skeletons';

export function MomentsTabContent({ assetId }: { assetId: string }) {
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.api.moments
      .get({ query: { assetId, preset: 'default' } })
      .then(({ data }) => {
        setMoments((data as Moment[]) ?? []);
      })
      .catch(() => {
        setMoments([]);
      });
  }, [assetId]);

  if (moments === null) {
    return <MomentsTabSkeleton />;
  }

  return <MomentsTab assetId={assetId} initialMoments={moments} />;
}
