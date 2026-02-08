import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import {
  createId,
  lifecycle_dates,
  type CollectionId,
  type CollectionItemId,
  type UserId,
  type AssetId,
} from '../helpers';
import { user } from './auth';
import { mediaAssets } from './media-assets';

export const collections = pgTable('collection', {
  id: text('id')
    .$type<CollectionId>()
    .primaryKey()
    .$defaultFn(() => createId<CollectionId>('col')),
  userId: text('user_id')
    .$type<UserId>()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  ...lifecycle_dates,
});

export const collectionItems = pgTable('collection_item', {
  id: text('id')
    .$type<CollectionItemId>()
    .primaryKey()
    .$defaultFn(() => createId<CollectionItemId>('ci')),
  collectionId: text('collection_id')
    .$type<CollectionId>()
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  assetId: text('asset_id')
    .$type<AssetId>()
    .notNull()
    .references(() => mediaAssets.id, { onDelete: 'cascade' }),
  position: integer('position'),
  ...lifecycle_dates,
});
