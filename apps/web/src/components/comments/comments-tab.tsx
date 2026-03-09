'use client';

import { useCallback, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import type { Comment } from '@milkpod/api/types';
import { api } from '~/lib/api';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { CommentCard } from './comment-card';

interface CommentsTabProps {
  assetId: string;
  initialComments: Comment[];
}

export function CommentsTab({ assetId, initialComments }: CommentsTabProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate(regenerate = false) {
    setGenerating(true);
    try {
      const { data, error } = await api.api.comments.generate.post({
        assetId,
        regenerate,
      });
      if (error) throw new Error(String(error));
      setComments((data as Comment[]) ?? []);
    } catch {
      // Error handled by global handler
    } finally {
      setGenerating(false);
    }
  }

  async function handleDismiss(commentId: string) {
    const { error } = await api.api
      .comments({ id: commentId })
      .feedback.post({ action: 'dismiss' });
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  }

  const isEmpty = !generating && comments.length === 0;

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Header row */}
      {comments.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </p>
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
        </div>
      )}

      {/* Content */}
      {generating ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Spinner className="size-5" />
          <p className="text-sm text-muted-foreground">
            Generating comments from transcript and visual context...
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <MessageCircle className="size-8 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              No comments yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate AI comments to get timestamped insights from audio and
              visual content.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => handleGenerate(false)}
            disabled={generating}
          >
            <MessageCircle className="size-3" />
            Generate Comments
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
