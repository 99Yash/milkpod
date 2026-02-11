import { pgTable, text } from 'drizzle-orm/pg-core';
import {
  createId,
  lifecycle_dates,
  type ShareLinkId,
  type ShareQueryId,
} from '../helpers';
import { shareLinks } from './share-links';

export const shareQueries = pgTable('share_query', {
  id: text('id')
    .$type<ShareQueryId>()
    .primaryKey()
    .$defaultFn(() => createId<ShareQueryId>('shq')),
  shareLinkId: text('share_link_id')
    .$type<ShareLinkId>()
    .notNull()
    .references(() => shareLinks.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  ...lifecycle_dates,
});
