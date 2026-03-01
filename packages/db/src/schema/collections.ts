import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { mediaAssets } from './media-assets';

export const collections = pgTable('collection', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId('col')),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  ...lifecycle_dates,
});

export const collectionItems = pgTable(
  'collection_item',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('ci')),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: integer('position'),
    ...lifecycle_dates,
  },
  (t) => [
    index('collection_item_collection_id_idx').on(t.collectionId),
    index('collection_item_asset_id_idx').on(t.assetId),
  ],
);
