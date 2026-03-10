import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { mediaAssets } from './media-assets';

export const commentSourceEnum = pgEnum('comment_source', [
  'audio',
  'visual',
  'hybrid',
]);

export const assetComments = pgTable(
  'asset_comment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('cmt')),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    source: commentSourceEnum('source').notNull(),
    evidenceRefs: jsonb('evidence_refs').$type<{
      transcriptSegmentIds: string[];
      visualSegmentIds: string[];
    }>(),
    dismissedAt: timestamp('dismissed_at'),
    ...lifecycle_dates,
  },
  (t) => [
    index('asset_comment_asset_start_idx').on(t.assetId, t.startTime),
    index('asset_comment_user_asset_idx').on(t.userId, t.assetId),
  ],
);
