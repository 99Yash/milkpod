import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import {
  createId,
  lifecycle_dates,
  type AssetId,
  type CollectionId,
  type ShareLinkId,
  type UserId,
} from '../helpers';
import { user } from './auth';
import { mediaAssets } from './media-assets';
import { collections } from './collections';

export const shareLinks = pgTable('share_link', {
  id: text('id')
    .$type<ShareLinkId>()
    .primaryKey()
    .$defaultFn(() => createId<ShareLinkId>('shr')),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .$type<UserId>()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  assetId: text('asset_id')
    .$type<AssetId>()
    .references(() => mediaAssets.id, { onDelete: 'cascade' }),
  collectionId: text('collection_id')
    .$type<CollectionId>()
    .references(() => collections.id, { onDelete: 'cascade' }),
  canQuery: boolean('can_query').default(false).notNull(),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  ...lifecycle_dates,
});
