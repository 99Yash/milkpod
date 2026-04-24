'use client';

import { useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEntitlementsForPlan } from '@milkpod/ai/plans';
import { fetchShareLinks, createShareLink } from '~/lib/api-fetchers';
import { handleUpgradeError } from '~/lib/upgrade-prompt';
import {
  getCachedIsAdmin,
  getCachedPlan,
  setActiveShareLinkCount,
  checkShareLinkLimit,
  incrementActiveShareLinkCount,
  decrementActiveShareLinkCount,
} from '~/lib/plan-cache';
import { queryKeys } from '~/lib/query-keys';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '~/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import type { ShareLink } from '@milkpod/api/types';
import { CollaboratorsSection } from './collaborators-section';

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
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/share/${token}`;
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Share2 className="size-3.5" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle className="line-clamp-2 pr-6">
            Share “{resourceName}”
          </DialogTitle>
          <DialogDescription>
            Invite people or create a public link.
          </DialogDescription>
        </DialogHeader>

        {assetId ? (
          <Tabs defaultValue="people" className="min-w-0 gap-4">
            <TabsList className="w-full">
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="link">Public link</TabsTrigger>
            </TabsList>
            <TabsContent value="people" className="min-w-0">
              <CollaboratorsSection assetId={assetId} />
            </TabsContent>
            <TabsContent value="link" className="min-w-0">
              <PublicLinkSection assetId={assetId} collectionId={undefined} />
            </TabsContent>
          </Tabs>
        ) : (
          <PublicLinkSection assetId={undefined} collectionId={collectionId} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PublicLinkSectionProps {
  assetId: string | undefined;
  collectionId: string | undefined;
}

function PublicLinkSection({ assetId, collectionId }: PublicLinkSectionProps) {
  const queryClient = useQueryClient();
  const [canQuery, setCanQuery] = useState(false);
  const [expiry, setExpiry] = useState('none');
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const isAdmin = getCachedIsAdmin() === true;
  const plan = getCachedPlan();
  const canUsePublicShareQA =
    isAdmin ||
    (plan ? getEntitlementsForPlan(plan).canUsePublicShareQA : true);

  const queryKey = queryKeys.shareLinks({ assetId, collectionId });

  const { data: existingLinks = [], isLoading: loadingLinks } = useQuery({
    queryKey,
    queryFn: async () => {
      const links = await fetchShareLinks();
      setActiveShareLinkCount(links.length);
      return links.filter((link) =>
        assetId ? link.assetId === assetId : link.collectionId === collectionId
      );
    },
  });

  const handleCanQueryChange = (checked: boolean) => {
    if (checked && !canUsePublicShareQA) {
      handleUpgradeError({
        status: 402,
        value: { code: 'PUBLIC_SHARE_QA_NOT_ALLOWED' },
      });
      return;
    }
    setCanQuery(checked);
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

  const handleCreate = async () => {
    const limitCheck = checkShareLinkLimit();
    if (limitCheck && !limitCheck.allowed) {
      handleUpgradeError({ status: 402, value: { code: 'SHARE_LINK_LIMIT' } });
      return;
    }

    setCreating(true);
    try {
      const result = await createShareLink({
        assetId: assetId ?? undefined,
        collectionId: collectionId ?? undefined,
        canQuery,
        expiresAt: getExpiryDate(expiry),
      });
      if ('error' in result) {
        if (handleUpgradeError(result.error)) return;
        toast.error('Failed to create share link');
        return;
      }
      queryClient.setQueryData<ShareLink[]>(queryKey, (prev) => [
        ...(prev ?? []),
        result,
      ]);
      incrementActiveShareLinkCount();
      await copyToClipboard(result.token);
      toast.success('Link created and copied');
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
      queryClient.setQueryData<ShareLink[]>(
        queryKey,
        (prev) => prev?.filter((l) => l.id !== linkId) ?? []
      );
      decrementActiveShareLinkCount();
      toast.success('Link revoked');
    } catch {
      toast.error('Failed to revoke link');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="can-query" className="text-sm">
              Allow AI Q&amp;A
            </Label>
            <p className="text-xs text-muted-foreground">
              Viewers can ask questions about this content.
            </p>
          </div>
          <Switch
            id="can-query"
            checked={canQuery}
            onCheckedChange={handleCanQueryChange}
            disabled={!canUsePublicShareQA}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="share-expiry" className="text-sm">
            Expires
          </Label>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger id="share-expiry" className="w-36" size="sm">
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

        <Button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="w-full gap-1.5"
        >
          {creating ? (
            <Spinner className="size-4" />
          ) : (
            <Link2 className="size-4" />
          )}
          Create link
        </Button>
      </div>

      {loadingLinks ? (
        <div className="flex justify-center py-2">
          <Spinner className="size-4" />
        </div>
      ) : existingLinks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Active links
          </p>
          <ul className="space-y-1">
            {existingLinks.map((link) => (
              <li
                key={link.id}
                className="group flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 transition-colors hover:bg-muted/70"
              >
                <div className="min-w-0 flex-1">
                  <code className="block truncate font-mono text-xs text-foreground">
                    {getShareUrl(link.token)}
                  </code>
                  <p className="text-[10px] text-muted-foreground">
                    {link.canQuery ? 'Q&A enabled' : 'View only'}
                    {' · '}
                    Expires {formatExpiry(link.expiresAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 shrink-0 p-0"
                  onClick={() => copyToClipboard(link.token)}
                  aria-label="Copy link"
                >
                  {copiedToken === link.token ? (
                    <Check className="size-3.5 text-green-500 animate-in zoom-in-50 duration-150" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 shrink-0 p-0 text-muted-foreground"
                      aria-label="Link options"
                      disabled={revokingId === link.id}
                    >
                      {revokingId === link.id ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <MoreIcon />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => handleRevoke(link.id)}
                    >
                      Revoke link
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MoreIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}
