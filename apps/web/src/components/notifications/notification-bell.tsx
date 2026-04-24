'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useReplicache } from '~/lib/replicache/context';
import { useSubscribedNotifications } from '~/lib/replicache/hooks';
import { route } from '~/lib/routes';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/utils';
import { NotificationRow } from './notification-row';
import type { SyncedNotification } from '@milkpod/sync';

const POPOVER_LIMIT = 10;

export function NotificationBell() {
  const rep = useReplicache();
  const { items, unreadCount, ready } = useSubscribedNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const visible = items.slice(0, POPOVER_LIMIT);
  const hasMore = items.length > POPOVER_LIMIT;

  const handleItemClick = async (n: SyncedNotification) => {
    if (rep && n.readAt == null) {
      try {
        await rep.mutate.notificationMarkRead({
          id: n.id,
          readAt: Date.now(),
        });
      } catch {
        // Non-fatal — navigation still happens. Next pull will reconcile.
      }
    }
    setOpen(false);
    router.push(route(`/asset/${n.resourceId}`));
  };

  const handleMarkAllRead = async () => {
    if (!rep || unreadCount === 0) return;
    try {
      await rep.mutate.notificationMarkAllRead({ readAt: Date.now() });
    } catch {
      // Non-fatal.
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative size-9 rounded-full p-0"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : 'Notifications'
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className={cn(
              'text-xs transition-colors',
              unreadCount > 0
                ? 'text-muted-foreground hover:text-foreground'
                : 'text-muted-foreground/50',
            )}
          >
            Mark all read
          </button>
        </div>

        {!ready ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            You're all caught up.
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {visible.map((n) => (
              <li key={n.id}>
                <NotificationRow
                  notification={n}
                  onClick={() => handleItemClick(n)}
                />
              </li>
            ))}
          </ul>
        )}

        {hasMore ? (
          <div className="border-t px-3 py-2 text-center">
            <Link
              href={route('/notifications')}
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
