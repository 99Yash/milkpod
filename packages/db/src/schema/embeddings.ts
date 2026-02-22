import { index, integer, pgTable, text, vector } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { transcriptSegments } from './transcript-segments';

export const embeddings = pgTable(
  'embedding',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('emb')),
    segmentId: text('segment_id')
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    model: text('model').default('text-embedding-3-small').notNull(),
    dimensions: integer('dimensions').default(1536).notNull(),
    ...lifecycle_dates,
  },
  (t) => [
    index('embedding_segment_id_idx').on(t.segmentId),
    index('embedding_hnsw_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops')
    ),
  ]
);
