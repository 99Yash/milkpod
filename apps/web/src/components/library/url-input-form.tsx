'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { Loader2, Plus, Upload, Link, X } from 'lucide-react';
import { cn } from '~/lib/utils';
import { handleUpgradeError } from '~/lib/upgrade-prompt';

interface UrlInputFormProps {
  onSuccess: () => void;
}

type InputMode = 'url' | 'upload';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_TYPES = 'audio/*,video/*';

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UrlInputForm({ onSuccess }: UrlInputFormProps) {
  const [mode, setMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): boolean => {
    if (!f.type.startsWith('audio/') && !f.type.startsWith('video/')) {
      toast.error('Please upload an audio or video file');
      return false;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`);
      return false;
    }
    return true;
  }, []);

  const handleFileSelect = useCallback(
    (f: File) => {
      if (validateFile(f)) {
        setFile(f);
        setMode('upload');
      }
    },
    [validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  const handleSubmitUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await api.api.ingest.post({ url: trimmed });
      if (error) {
        if (handleUpgradeError(error)) return;
        const errVal = error.value;
        toast.error(
          typeof errVal === 'object' && errVal && 'message' in errVal
            ? String(errVal.message)
            : 'Failed to add video'
        );
        return;
      }
      const title = data && 'title' in data ? data.title : 'video';
      toast.success(`Added "${title}"`);
      setUrl('');
      onSuccess();
    } catch {
      toast.error('Failed to add video');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitFile = async () => {
    if (!file) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await api.api.ingest.upload.post({ file });
      if (error) {
        if (handleUpgradeError(error)) return;
        const errVal = error.value;
        toast.error(
          typeof errVal === 'object' && errVal && 'message' in errVal
            ? String(errVal.message)
            : 'Failed to upload file'
        );
        return;
      }
      const title = data && 'title' in data ? data.title : 'file';
      toast.success(`Added "${title}"`);
      setFile(null);
      onSuccess();
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (mode === 'url') await handleSubmitUrl();
    else await handleSubmitFile();
  };

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={cn(
            'flex items-center gap-1.5 rounded-md pl-2 pr-2.5 py-1 text-xs font-medium transition-colors',
            mode === 'url'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Link className="size-3" />
          URL
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            'flex items-center gap-1.5 rounded-md pl-2 pr-2.5 py-1 text-xs font-medium transition-colors',
            mode === 'upload'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Upload className="size-3" />
          Upload
        </button>
      </div>

      {mode === 'url' ? (
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
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
              )}
            >
              <Upload className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drop an audio or video file, or{' '}
                <span className="font-medium text-foreground underline underline-offset-2">
                  browse
                </span>
              </p>
              <p className="text-xs text-muted-foreground/70">
                Up to {formatFileSize(MAX_FILE_SIZE)}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isSubmitting}
              >
                <X className="size-3.5" />
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
