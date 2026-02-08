'use client';

import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { Loader2, Plus } from 'lucide-react';

interface UrlInputFormProps {
  onSuccess: () => void;
}

export function UrlInputForm({ onSuccess }: UrlInputFormProps) {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await api.api.ingest.post({ url: trimmed });
      if (error) {
        toast.error(
          typeof error.value === 'object' && error.value && 'message' in error.value
            ? (error.value as { message: string }).message
            : 'Failed to add video'
        );
        return;
      }
      const title =
        data && 'title' in data ? data.title : 'video';
      toast.success(`Added "${title}"`);
      setUrl('');
      onSuccess();
    } catch {
      toast.error('Failed to add video');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a YouTube URL..."
        className="flex-1"
        disabled={isSubmitting}
      />
      <Button type="submit" size="sm" disabled={isSubmitting || !url.trim()}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        Add
      </Button>
    </form>
  );
}
