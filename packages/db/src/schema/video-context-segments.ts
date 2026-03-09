import { index, jsonb, pgTable, real, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { mediaAssets } from './media-assets';

export const videoContextSegments = pgTable(
  'video_context_segment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('vcs')),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    summary: text('summary').notNull(),
    ocrText: text('ocr_text'),
    entities: jsonb('entities').$type<string[]>(),
    confidence: real('confidence'),
    providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>(),
    ...lifecycle_dates,
  },
  (t) => [
    index('video_context_segment_asset_id_idx').on(t.assetId),
    index('video_context_segment_start_time_idx').on(t.assetId, t.startTime),
  ]
);
