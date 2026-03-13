'use client';

import { useEffect, useRef, useState } from 'react';
import type { Comment } from '@milkpod/api/types';
import { api } from '~/lib/api';
import { CommentsTab } from '~/components/comments/comments-tab';
import { CommentsTabSkeleton } from '~/components/asset/skeletons';

export function CommentsTabContent({ assetId }: { assetId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.api.comments
      .get({ query: { assetId } })
      .then(({ data }) => {
        setComments((data as Comment[]) ?? []);
      })
      .catch(() => {
        setComments([]);
      });
  }, [assetId]);

  if (comments === null) {
    return <CommentsTabSkeleton />;
  }

  return <CommentsTab assetId={assetId} initialComments={comments} />;
}
