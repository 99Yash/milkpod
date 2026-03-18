import type { FinishReason } from 'ai';
import { index, integer, jsonb, pgTable, real, text, unique } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { collections } from './collections';
import { mediaAssets } from './media-assets';
import { transcriptSegments } from './transcript-segments';
import { videoContextSegments } from './video-context-segments';

/** Typed shape for the `qa_message.metadata` jsonb column. */
export type QaMessageMetadata = {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  durationMs?: number;
  finishReason?: FinishReason;
};

export const qaThreads = pgTable(
  'qa_thread',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('thrd')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .references(() => mediaAssets.id, { onDelete: 'set null' }),
    collectionId: text('collection_id')
      .references(() => collections.id, { onDelete: 'set null' }),
    title: text('title'),
    ...lifecycle_dates,
  },
  (t) => [
    index('qa_thread_asset_user_idx').on(t.assetId, t.userId),
    index('qa_thread_user_created_idx').on(t.userId, t.createdAt),
  ],
);

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
    metadata: jsonb('metadata').$type<QaMessageMetadata>(),
    ...lifecycle_dates,
  },
  (t) => [index('qa_message_thread_created_idx').on(t.threadId, t.createdAt)],
);

export const qaMessageParts = pgTable(
  'qa_message_part',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('mpt')),
    messageId: text('message_id')
      .notNull()
      .references(() => qaMessages.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    textContent: text('text_content'),
    toolCallId: text('tool_call_id'),
    toolName: text('tool_name'),
    toolState: text('tool_state'),
    toolInput: jsonb('tool_input'),
    toolOutput: jsonb('tool_output'),
    translatedTextContent: text('translated_text_content'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('qa_message_part_message_sort_idx').on(t.messageId, t.sortOrder)],
);

export const qaEvidence = pgTable(
  'qa_evidence',
  {
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
  },
  (t) => [
    unique('qa_evidence_message_segment_uniq').on(t.messageId, t.segmentId),
    index('qa_evidence_message_id_idx').on(t.messageId),
    index('qa_evidence_segment_id_idx').on(t.segmentId),
  ],
);

export const qaVisualEvidence = pgTable(
  'qa_visual_evidence',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('vevd')),
    messageId: text('message_id')
      .notNull()
      .references(() => qaMessages.id, { onDelete: 'cascade' }),
    videoContextSegmentId: text('video_context_segment_id')
      .notNull()
      .references(() => videoContextSegments.id, { onDelete: 'cascade' }),
    relevanceScore: real('relevance_score'),
    ...lifecycle_dates,
  },
  (t) => [
    unique('qa_visual_evidence_message_segment_uniq').on(t.messageId, t.videoContextSegmentId),
    index('qa_visual_evidence_message_id_idx').on(t.messageId),
    index('qa_visual_evidence_segment_id_idx').on(t.videoContextSegmentId),
  ],
);
