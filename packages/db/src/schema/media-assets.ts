import { integer, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';

export const sourceTypeEnum = pgEnum('source_type', [
  'youtube',
  'podcast',
  'upload',
  'external',
]);

export const mediaTypeEnum = pgEnum('media_type', ['audio', 'video']);

export const assetStatusEnum = pgEnum('asset_status', [
  'queued',
  'fetching',
  'transcribing',
  'embedding',
  'ready',
  'failed',
]);

export const mediaAssets = pgTable(
  'media_asset',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('asset')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceUrl: text('source_url'),
    sourceType: sourceTypeEnum('source_type').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),
    status: assetStatusEnum('status').default('queued').notNull(),
    duration: integer('duration'),
    channelName: text('channel_name'),
    thumbnailUrl: text('thumbnail_url'),
    sourceId: text('source_id'),
    idempotencyKey: text('idempotency_key'),
    lastError: text('last_error'),
    attempts: integer('attempts').default(0).notNull(),
    providerJobId: text('provider_job_id'),
    ...lifecycle_dates,
  },
  (t) => [unique('media_asset_idempotency_key_unique').on(t.idempotencyKey)]
);
