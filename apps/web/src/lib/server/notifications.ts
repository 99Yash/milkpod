import 'server-only';

import { db } from '@milkpod/db';
import { notifications } from '@milkpod/db/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import { emitReplicachePokes } from '@milkpod/api/events/replicache-events';

/**
 * Server-side helper: mark all unread notifications a user has about a given
 * asset as read. Called from the asset page's server component so the bell
 * item doesn't linger as unread when the user reaches the asset by any path
 * (direct URL, library click, share link, etc.).
 *
 * Fires a Replicache poke on the user channel so every open session pulls
 * the new read state. Fully fire-and-forget; failures are logged and do not
 * bubble up.
 */
export async function markNotificationsReadForAsset(
  userId: string,
  assetId: string,
): Promise<void> {
  try {
    const rows = await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.resourceType, 'asset'),
          eq(notifications.resourceId, assetId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });

    if (rows.length > 0) {
      try {
        emitReplicachePokes([userId], assetId);
      } catch {
        // Redis unavailable — heartbeat + next manual pull will reconcile.
      }
    }
  } catch (err) {
    console.warn(
      '[notifications] auto-mark-read failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
