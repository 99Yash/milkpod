import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates, type TranscriptId, type AssetId } from '../helpers';
import { mediaAssets } from './media-assets';

export const transcripts = pgTable('transcript', {
  id: text('id')
    .$type<TranscriptId>()
    .primaryKey()
    .$defaultFn(() => createId<TranscriptId>('trsc')),
  assetId: text('asset_id')
    .$type<AssetId>()
    .notNull()
    .references(() => mediaAssets.id, { onDelete: 'cascade' }),
  provider: text('provider').default('elevenlabs').notNull(),
  providerJobId: text('provider_job_id'),
  language: text('language'),
  totalSegments: integer('total_segments'),
  providerMetadata: jsonb('provider_metadata'),
  ...lifecycle_dates,
});
