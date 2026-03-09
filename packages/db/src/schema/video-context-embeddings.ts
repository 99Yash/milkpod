import { index, integer, pgTable, text, vector } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { videoContextSegments } from './video-context-segments';

export const videoContextEmbeddings = pgTable(
  'video_context_embedding',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('vce')),
    segmentId: text('segment_id')
      .notNull()
      .references(() => videoContextSegments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    model: text('model').default('text-embedding-3-small').notNull(),
    dimensions: integer('dimensions').default(1536).notNull(),
    ...lifecycle_dates,
  },
  (t) => [
    index('video_context_embedding_segment_id_idx').on(t.segmentId),
    index('video_context_embedding_hnsw_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops')
    ),
  ]
);
