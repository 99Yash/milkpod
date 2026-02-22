import { index, jsonb, pgTable, real, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { collections } from './collections';
import { mediaAssets } from './media-assets';
import { transcriptSegments } from './transcript-segments';

export const qaThreads = pgTable('qa_thread', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId('thrd')),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').references(() => mediaAssets.id, {
    onDelete: 'set null',
  }),
  collectionId: text('collection_id').references(() => collections.id, {
    onDelete: 'set null',
  }),
  title: text('title'),
  ...lifecycle_dates,
});

export const qaMessages = pgTable(
  'qa_message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('msg')),
    threadId: text('thread_id')
      .notNull()
      .references(() => qaThreads.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    parts: jsonb('parts').notNull(),
    ...lifecycle_dates,
  },
  (t) => [index('qa_message_thread_id_idx').on(t.threadId)],
);

export const qaEvidence = pgTable('qa_evidence', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId('evd')),
  messageId: text('message_id')
    .notNull()
    .references(() => qaMessages.id, { onDelete: 'cascade' }),
  segmentId: text('segment_id')
    .notNull()
    .references(() => transcriptSegments.id, { onDelete: 'cascade' }),
  relevanceScore: real('relevance_score'),
  ...lifecycle_dates,
});
