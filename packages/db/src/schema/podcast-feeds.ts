import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';

export const podcastFeeds = pgTable('podcast_feed', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId('feed')),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  feedUrl: text('feed_url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  author: text('author'),
  language: text('language'),
  totalEpisodes: integer('total_episodes'),
  refreshIntervalMins: integer('refresh_interval_mins').default(60).notNull(),
  lastFetchedAt: timestamp('last_fetched_at'),
  ...lifecycle_dates,
});
