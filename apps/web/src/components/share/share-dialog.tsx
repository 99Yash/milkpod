'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { Spinner } from '~/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import type { ShareLink } from '@milkpod/api/types';

interface ShareDialogProps {
  assetId?: string;
  collectionId?: string;
  resourceName: string;
}

const EXPIRY_OPTIONS = [
  { value: 'none', label: 'Never' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
] as const;

function getExpiryDate(value: string): string | undefined {
  const now = Date.now();
  switch (value) {
    case '1h':
      return new Date(now + 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now + 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

function getShareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

function formatExpiry(expiresAt: Date | string | null): string {
  if (!expiresAt) return 'Never';
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ShareDialog({
  assetId,
  collectionId,
  resourceName,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [canQuery, setCanQuery] = useState(false);
  const [expiry, setExpiry] = useState('none');
  const [creating, setCreating] = useState(false);
  const [existingLinks, setExistingLinks] = useState<ShareLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Load existing share links when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function loadLinks() {
      setLoadingLinks(true);
      try {
        const { data } = await api.api.shares.get();
        if (cancelled || !data) return;
        // Filter to only this resource's links
        const filtered = (data as ShareLink[]).filter((link) =>
          assetId ? link.assetId === assetId : link.collectionId === collectionId
        );
        setExistingLinks(filtered);
      } catch {
        // Silently fail — non-critical
      } finally {
        if (!cancelled) setLoadingLinks(false);
      }
    }

    loadLinks();
    return () => {
      cancelled = true;
    };
  }, [open, assetId, collectionId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data, error } = await api.api.shares.post({
        assetId: assetId ?? undefined,
        collectionId: collectionId ?? undefined,
        canQuery,
        expiresAt: getExpiryDate(expiry),
      });
      if (error || !data) {
        toast.error('Failed to create share link');
        return;
      }
      const link = data as ShareLink;
      setExistingLinks((prev) => [...prev, link]);
      // Auto-copy to clipboard
      await copyToClipboard(link.token);
      toast.success('Share link created and copied to clipboard');
      setCanQuery(false);
      setExpiry('none');
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      await api.api.shares({ id: linkId }).delete();
      setExistingLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success('Share link revoked');
    } catch {
      toast.error('Failed to revoke share link');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Share2 className="size-3.5" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{resourceName}"</DialogTitle>
          <DialogDescription>
            Create a link to share this {assetId ? 'asset' : 'collection'} with
            others. Anyone with the link can view the content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Create new link section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="can-query" className="text-sm">
                Allow AI Q&A
              </Label>
              <Switch
                id="can-query"
                checked={canQuery}
                onCheckedChange={setCanQuery}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Expires</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger className="w-32" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="sm:justify-start">
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="gap-1.5"
            >
              {creating ? (
                <Spinner className="size-4" />
              ) : (
                <Link2 className="size-4" />
              )}
              Create link
            </Button>
          </DialogFooter>

          {/* Existing links */}
          {loadingLinks ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-4" />
            </div>
          ) : existingLinks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Active links
              </p>
              <div className="space-y-1.5">
                {existingLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-foreground">
                        {getShareUrl(link.token)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {link.canQuery ? 'Q&A enabled' : 'View only'}
                        {' · '}
                        Expires: {formatExpiry(link.expiresAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      onClick={() => copyToClipboard(link.token)}
                    >
                      {copiedToken === link.token ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(link.id)}
                      disabled={revokingId === link.id}
                    >
                      {revokingId === link.id ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
