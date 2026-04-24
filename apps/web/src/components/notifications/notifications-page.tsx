'use client';

import { useRouter } from 'next/navigation';
import { useReplicache } from '~/lib/replicache/context';
import { useSubscribedNotifications } from '~/lib/replicache/hooks';
import { route } from '~/lib/routes';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { NotificationRow } from './notification-row';
import type { SyncedNotification } from '@milkpod/sync';

export function NotificationsPage() {
  const rep = useReplicache();
  const router = useRouter();
  const { items, unreadCount, ready } = useSubscribedNotifications();

  const handleItemClick = async (n: SyncedNotification) => {
    if (rep && n.readAt == null) {
      try {
        await rep.mutate.notificationMarkRead({
          id: n.id,
          readAt: Date.now(),
        });
      } catch {
        // Non-fatal.
      }
    }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : 'You’re all caught up.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </Button>
      </div>

      {!ready ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No notifications yet. When someone shares an asset with you, it’ll
          show up here.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationRow
                notification={n}
                onClick={() => handleItemClick(n)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
