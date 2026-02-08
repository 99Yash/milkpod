import { index, integer, pgTable, real, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates, type SegmentId, type TranscriptId } from '../helpers';
import { transcripts } from './transcripts';

export const transcriptSegments = pgTable(
  'transcript_segment',
  {
    id: text('id')
      .$type<SegmentId>()
      .primaryKey()
      .$defaultFn(() => createId<SegmentId>('seg')),
    transcriptId: text('transcript_id')
      .$type<TranscriptId>()
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index').notNull(),
    text: text('text').notNull(),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    speaker: text('speaker'),
    ...lifecycle_dates,
  },
  (t) => [
    index('transcript_segment_transcript_id_idx').on(t.transcriptId),
    index('transcript_segment_transcript_start_idx').on(
      t.transcriptId,
      t.startTime
    ),
  ]
);
