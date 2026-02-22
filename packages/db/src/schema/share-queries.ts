import { pgTable, text } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { shareLinks } from './share-links';

export const shareQueries = pgTable('share_query', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId('shq')),
  shareLinkId: text('share_link_id')
    .notNull()
    .references(() => shareLinks.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  ...lifecycle_dates,
});
