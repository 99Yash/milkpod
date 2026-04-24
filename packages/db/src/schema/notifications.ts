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
 * (mentions, comment replies, transcript ready, etc.). The `body` shape for
 * each type lives in the discriminated union exported by the API package.
 */
export type NotificationType =
  | 'asset.member.added'
  | 'asset.member.role_changed'
  | 'asset.member.removed';

export type NotificationResourceType = 'asset';

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
     * Type-specific payload. The shape is narrowed by `type` in the public
     * discriminated union; stored as opaque JSON at the DB level.
     */
    body: jsonb('body').notNull().default({}),
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
