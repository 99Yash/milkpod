import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';

/**
 * Finite set of notification types. Extend as new categories are added
 * (mentions, comment replies, transcript ready, etc.). `NotificationBody`
 * below keeps the row-level discriminant + payload pair in sync with `type`.
 */
export type NotificationType =
  | 'asset.member.added'
  | 'asset.member.role_changed'
  | 'asset.member.removed';

export type NotificationResourceType = 'asset';

/**
 * Non-owner roles a user can hold on an asset. Mirrors `assetMemberRoleEnum`
 * minus 'owner' — notification payloads never reference owner transitions
 * because ownership isn't granted via the member flow.
 */
type NotifiableRole = 'editor' | 'viewer';

/**
 * Payload stored in `notification.body`, keyed by the row's `type`. The
 * union branches MUST stay in lockstep with `NotificationType` — extend both
 * together. Use `NotificationBodyFor<T>` when you know the concrete type.
 */
export type NotificationBody =
  | { role: NotifiableRole }
  | { fromRole: NotifiableRole; toRole: NotifiableRole }
  | Record<string, never>;

export const notifications = pgTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('notif')),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<NotificationType>(),
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    resourceType: text('resource_type').$type<NotificationResourceType>(),
    resourceId: text('resource_id'),
    /**
     * Type-specific payload. The concrete shape is narrowed by `type` in the
     * public discriminated union (see `@milkpod/api` `Notification`); the
     * column-level type is the union of all branches.
     */
    body: jsonb('body').$type<NotificationBody>().notNull().default({}),
    readAt: timestamp('read_at'),
    rowVersion: integer('row_version').notNull().default(0),
    ...lifecycle_dates,
  },
  (t) => [
    index('notification_recipient_created_idx').on(
      t.recipientId,
      t.createdAt,
    ),
    index('notification_recipient_unread_idx')
      .on(t.recipientId)
      .where(sql`${t.readAt} IS NULL`),
    index('notification_recipient_row_version_idx').on(
      t.recipientId,
      t.rowVersion,
    ),
  ],
);
