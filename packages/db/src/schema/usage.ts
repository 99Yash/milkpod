import { date, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';

export const dailyUsage = pgTable(
  'daily_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('usg')),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    usageDate: date('usage_date').notNull(),
    wordsUsed: integer('words_used').notNull().default(0),
    ...lifecycle_dates,
  },
  (t) => [
    unique('daily_usage_user_date_uniq').on(t.userId, t.usageDate),
  ],
);
