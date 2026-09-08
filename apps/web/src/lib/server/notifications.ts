import 'server-only';

import { db } from '@milkpod/db';
import { notifications, realtimeEvents } from '@milkpod/db/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import { ensureEdgeDb } from '~/lib/db-edge';

/**
 * Server-side helper: mark all unread notifications a user has about a given
 * asset as read. Called from the asset page's server component so the bell
 * item doesn't linger as unread when the user reaches the asset by any path
 * (direct URL, library click, share link, etc.).
 *
 * Fires a Replicache poke on the user channel so every open session pulls
 * the new read state. The poke is a durable outbox row (same transport the
 * API edge SSE loops poll), so it reaches all clients — unlike a local
 * emitter, which would be isolate-local on the edge. Fully fire-and-forget;
 * failures are logged and do not bubble up.
 */
export async function markNotificationsReadForAsset(
  userId: string,
  assetId: string,
): Promise<void> {
  await ensureEdgeDb();
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
      // Durable poke AFTER the update committed (see the post-commit
      // contract on emitReplicachePokes): the API edge SSE loops poll the
      // outbox per user and forward `poke` rows to every connected client.
      await db()
        .insert(realtimeEvents)
        .values({ userId, kind: 'poke', payload: { assetId } });
    }
  } catch (err) {
    console.warn(
      '[notifications] auto-mark-read failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
