import { index, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { podcastFeeds } from './podcast-feeds';

export const filterActionEnum = pgEnum('filter_action', ['skip', 'mute']);

export const filterRules = pgTable(
  'filter_rule',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('rule')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    feedId: text('feed_id').references(() => podcastFeeds.id, {
      onDelete: 'cascade',
    }),
    label: text('label').notNull(),
    action: filterActionEnum('filter_action').notNull(),
    priority: integer('priority').default(0).notNull(),
    ...lifecycle_dates,
  },
  (t) => [
    index('filter_rule_user_id_idx').on(t.userId),
    index('filter_rule_feed_id_idx').on(t.feedId),
  ]
);
