import { db } from '@milkpod/db';
import {
  notifications,
  user as userTable,
  type NotificationType,
} from '@milkpod/db/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Notification, AssetRole, AssetOwner } from '../../types';
import { emitReplicachePokes } from '../../events/replicache-events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

export type RecordInput =
  | {
      type: 'asset.member.added';
      recipientId: string;
      actorId: string;
      assetId: string;
      body: { role: Exclude<AssetRole, 'owner'> };
    }
  | {
      type: 'asset.member.role_changed';
      recipientId: string;
      actorId: string;
      assetId: string;
      body: {
        fromRole: Exclude<AssetRole, 'owner'>;
        toRole: Exclude<AssetRole, 'owner'>;
      };
    }
  | {
      type: 'asset.member.removed';
      recipientId: string;
      actorId: string;
      assetId: string;
    };

export abstract class NotificationService {
  /**
   * Insert a notification row. Accepts a transaction handle so callers can
   * bundle the notification with the triggering mutation (`asset_member`
   * insert + notification insert commit together). Returns the inserted id.
   *
   * Does NOT emit the Replicache poke — call `NotificationService.poke()`
   * after the outer transaction commits. If the caller does not hold an open
   * tx, pass `db()` and the notification + poke happen in sequence.
   */
  static async record(
    tx: DbTx,
    input: RecordInput,
  ): Promise<string> {
    const body =
      input.type === 'asset.member.removed' ? {} : input.body;
    const [row] = await tx
      .insert(notifications)
      .values({
        recipientId: input.recipientId,
        type: input.type as NotificationType,
        actorId: input.actorId,
        resourceType: 'asset',
        resourceId: input.assetId,
        body,
      })
      .returning({ id: notifications.id });
    if (!row) throw new Error('Failed to insert notification');
    return row.id;
  }

  /**
   * Fire-and-forget Replicache poke for a recipient. Call this AFTER the
   * transaction that created the notification has committed, so the client's
   * pull sees the new row.
   */
  static poke(recipientId: string, assetId: string): void {
    try {
      emitReplicachePokes([recipientId], assetId);
    } catch (err) {
      console.warn(
        '[notifications] poke failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Shape a joined notification row for the public API / Replicache
   * serialization. Dates become epoch ms; body is cast to the discriminated
   * union branch implied by `type`.
   */
  static serialize(row: {
    id: string;
    recipientId: string;
    type: NotificationType;
    actorId: string | null;
    resourceType: string | null;
    resourceId: string | null;
    body: unknown;
    readAt: Date | null;
    rowVersion: number;
    createdAt: Date;
    actorName: string | null;
    actorImage: string | null;
  }): Notification | null {
    // `asset` is the only resourceType we produce for v1. Anything else means
    // the row was written by a newer server — skip it rather than mis-shape.
    if (row.resourceType !== 'asset' || !row.resourceId) return null;

    const base = {
      id: row.id,
      recipientId: row.recipientId,
      actorId: row.actorId,
      resourceType: 'asset' as const,
      resourceId: row.resourceId,
      readAt: row.readAt ? row.readAt.getTime() : null,
      createdAt: row.createdAt.getTime(),
      rowVersion: row.rowVersion,
      actor:
        row.actorId && row.actorName
          ? ({
              id: row.actorId,
              name: row.actorName,
              image: row.actorImage,
            } satisfies AssetOwner)
          : null,
    };

    switch (row.type) {
      case 'asset.member.added':
        return {
          ...base,
          type: 'asset.member.added',
          body: row.body as { role: Exclude<AssetRole, 'owner'> },
        };
      case 'asset.member.role_changed':
        return {
          ...base,
          type: 'asset.member.role_changed',
          body: row.body as {
            fromRole: Exclude<AssetRole, 'owner'>;
            toRole: Exclude<AssetRole, 'owner'>;
          },
        };
      case 'asset.member.removed':
        return { ...base, type: 'asset.member.removed', body: {} };
      default:
        return null;
    }
  }

  /** Fetch all notifications for a user, newest first. Joined with actor meta. */
  static async listForUser(userId: string): Promise<Notification[]> {
    const rows = await db()
      .select({
        id: notifications.id,
        recipientId: notifications.recipientId,
        type: notifications.type,
        actorId: notifications.actorId,
        resourceType: notifications.resourceType,
        resourceId: notifications.resourceId,
        body: notifications.body,
        readAt: notifications.readAt,
        rowVersion: notifications.rowVersion,
        createdAt: notifications.createdAt,
        actorName: userTable.name,
        actorImage: userTable.image,
      })
      .from(notifications)
      .leftJoin(userTable, eq(userTable.id, notifications.actorId))
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt));
    return rows
      .map(NotificationService.serialize)
      .filter((n): n is Notification => n !== null);
  }

  /**
   * Mark a single notification read IF it belongs to the given user. Returns
   * true when a row was updated. Safe to call repeatedly.
   */
  static async markRead(
    userId: string,
    notificationId: string,
  ): Promise<boolean> {
    const rows = await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length > 0;
  }

  /** Mark every unread notification for a user as read. Returns count updated. */
  static async markAllRead(userId: string): Promise<number> {
    const rows = await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length;
  }

  /**
   * Mark all unread notifications for a user about a specific asset as read.
   * Called when the user navigates directly to the asset — their bell item
   * shouldn't linger as unread.
   */
  static async markReadByResource(
    userId: string,
    resourceType: 'asset',
    resourceId: string,
  ): Promise<number> {
    const rows = await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.resourceType, resourceType),
          eq(notifications.resourceId, resourceId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length;
  }
}

