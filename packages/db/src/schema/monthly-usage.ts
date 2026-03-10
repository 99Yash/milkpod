import { date, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';

export const monthlyUsage = pgTable(
  'monthly_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('musage')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** First day of the billing period (e.g. '2026-03-01'). */
    periodStart: date('period_start').notNull(),
    videoMinutesUsed: integer('video_minutes_used').notNull().default(0),
    visualSegmentsUsed: integer('visual_segments_used').notNull().default(0),
    commentsGenerated: integer('comments_generated').notNull().default(0),
    ...lifecycle_dates,
  },
  (t) => [
    unique('monthly_usage_user_period_uniq').on(t.userId, t.periodStart),
  ],
);
