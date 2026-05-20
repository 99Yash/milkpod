'use client';

import type { SyncedNotification } from '@milkpod/sync';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { cn } from '~/lib/utils';

interface NotificationRowProps {
  notification: SyncedNotification;
  onClick?: () => void;
}

function renderMessage(n: SyncedNotification): string {
  const actor = n.actor?.name ?? 'Someone';
  switch (n.type) {
    case 'asset.member.added':
      return `${actor} added you as ${n.body.role}`;
    case 'asset.member.role_changed':
      return `${actor} changed your role to ${n.body.toRole}`;
    case 'asset.member.removed':
      return `${actor} removed you from an asset`;
    default: {
      const _exhaustive: never = n;
      throw new Error(
        `Unknown notification type: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString();
}

export function NotificationRow({
  notification,
  onClick,
}: NotificationRowProps) {
  const isUnread = notification.readAt == null;
  const initial =
    notification.actor?.name?.charAt(0).toUpperCase() || '?';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60',
        isUnread && 'bg-muted/30',
      )}
    >
      <Avatar className="mt-0.5 size-8 shrink-0">
        {notification.actor?.image ? (
          <AvatarImage
            src={notification.actor.image}
            alt={notification.actor.name}
          />
        ) : null}
        <AvatarFallback className="text-[10px] font-semibold">
          {initial}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">
          {renderMessage(notification)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatRelative(notification.createdAt)}
        </p>
      </div>
      {isUnread ? (
        <span
          aria-hidden
          className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
        />
      ) : null}
    </button>
  );
}
