import { index, pgTable, text, vector } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates, type EmbeddingId, type SegmentId } from '../helpers';
import { transcriptSegments } from './transcript-segments';

export const embeddings = pgTable(
  'embedding',
  {
    id: text('id')
      .$type<EmbeddingId>()
      .primaryKey()
      .$defaultFn(() => createId<EmbeddingId>('emb')),
    segmentId: text('segment_id')
      .$type<SegmentId>()
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
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
