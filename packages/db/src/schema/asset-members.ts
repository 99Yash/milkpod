import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { mediaAssets } from './media-assets';

export const assetMemberRoleEnum = pgEnum('asset_member_role', [
  'owner',
  'editor',
  'viewer',
]);

export const assetMembers = pgTable(
  'asset_member',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: assetMemberRoleEnum('role').notNull(),
    invitedBy: text('invited_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...lifecycle_dates,
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.userId] }),
    index('asset_member_user_idx').on(t.userId),
  ],
);

export const assetInvites = pgTable(
  'asset_invite',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('ainv')),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: assetMemberRoleEnum('role').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at'),
    ...lifecycle_dates,
  },
  (t) => [
    unique('asset_invite_asset_email_unique').on(t.assetId, t.email),
    index('asset_invite_email_idx').on(t.email),
  ],
);
