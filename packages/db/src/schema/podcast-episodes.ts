import { index, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { podcastFeeds } from './podcast-feeds';
import { mediaAssets } from './media-assets';

export const episodeStatusEnum = pgEnum('episode_status', [
  'queued',
  'fetching',
  'transcribing',
  'labeling',
  'editing',
  'publishing',
  'ready',
  'failed',
]);

export const podcastEpisodes = pgTable(
  'podcast_episode',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('epd')),
    feedId: text('feed_id')
      .notNull()
      .references(() => podcastFeeds.id, { onDelete: 'cascade' }),
    assetId: text('asset_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    guid: text('guid').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    sourceUrl: text('source_url').notNull(),
    publishedAt: text('published_at'),
    duration: integer('duration'),
    status: episodeStatusEnum('status').default('queued').notNull(),
    lastError: text('last_error'),
    attempts: integer('attempts').default(0).notNull(),
    ...lifecycle_dates,
  },
  (t) => [
    index('podcast_episode_feed_id_idx').on(t.feedId),
    index('podcast_episode_guid_idx').on(t.feedId, t.guid),
  ]
);
