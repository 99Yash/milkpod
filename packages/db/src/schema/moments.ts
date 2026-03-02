import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';
import { mediaAssets } from './media-assets';

export const momentPresetEnum = pgEnum('moment_preset', [
  'default',
  'hook',
  'insight',
  'quote',
  'actionable',
  'story',
]);

export const momentSourceEnum = pgEnum('moment_source', [
  'hybrid',
  'llm',
  'qa',
]);

export const assetMoments = pgTable(
  'asset_moment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('mmt')),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    preset: momentPresetEnum('preset').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    score: real('score').notNull(),
    scoreBreakdown: jsonb('score_breakdown'),
    source: momentSourceEnum('source').notNull(),
    isSaved: boolean('is_saved').default(false).notNull(),
    dismissedAt: timestamp('dismissed_at'),
    ...lifecycle_dates,
  },
  (t) => [
    index('asset_moment_asset_preset_score_idx').on(
      t.assetId,
      t.preset,
      t.score,
    ),
    index('asset_moment_asset_start_idx').on(t.assetId, t.startTime),
  ],
);

export const assetMomentFeedback = pgTable(
  'asset_moment_feedback',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('mmfb')),
    momentId: text('moment_id')
      .notNull()
      .references(() => assetMoments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    ...lifecycle_dates,
  },
  (t) => [
    unique('asset_moment_feedback_unique').on(t.momentId, t.userId, t.action),
    index('asset_moment_feedback_moment_idx').on(t.momentId),
  ],
);
