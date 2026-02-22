import { index, integer, pgEnum, pgTable, real, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { podcastEpisodes } from './podcast-episodes';

export const editActionEnum = pgEnum('edit_action', ['keep', 'skip', 'mute']);

export const episodeEdits = pgTable(
  'episode_edit',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('edt')),
    episodeId: text('episode_id')
      .notNull()
      .references(() => podcastEpisodes.id, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index').notNull(),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    action: editActionEnum('action').notNull(),
    label: text('label'),
    reason: text('reason'),
    ...lifecycle_dates,
  },
  (t) => [
    index('episode_edit_episode_id_idx').on(t.episodeId),
    index('episode_edit_episode_segment_idx').on(t.episodeId, t.segmentIndex),
  ]
);
