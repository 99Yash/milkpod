import { index, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { podcastEpisodes } from './podcast-episodes';

export const renderStatusEnum = pgEnum('render_status', [
  'pending',
  'rendering',
  'complete',
  'failed',
]);

export const episodeRenders = pgTable(
  'episode_render',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('rnd')),
    episodeId: text('episode_id')
      .notNull()
      .references(() => podcastEpisodes.id, { onDelete: 'cascade' }),
    status: renderStatusEnum('render_status').default('pending').notNull(),
    storageKey: text('storage_key'),
    format: text('format').default('mp3').notNull(),
    durationMs: integer('duration_ms'),
    fileSizeBytes: integer('file_size_bytes'),
    lastError: text('last_error'),
    ...lifecycle_dates,
  },
  (t) => [index('episode_render_episode_id_idx').on(t.episodeId)]
);
