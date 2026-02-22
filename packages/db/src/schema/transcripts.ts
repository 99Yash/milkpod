import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { mediaAssets } from './media-assets';

export const transcripts = pgTable(
  'transcript',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('trsc')),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    provider: text('provider').default('elevenlabs').notNull(),
    providerJobId: text('provider_job_id'),
    language: text('language'),
    totalSegments: integer('total_segments'),
    providerMetadata: jsonb('provider_metadata'),
    ...lifecycle_dates,
  },
  (t) => [index('transcript_asset_id_idx').on(t.assetId)],
);
