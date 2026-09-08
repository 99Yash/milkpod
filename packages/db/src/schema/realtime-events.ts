import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Realtime outbox (CF migration #33).
 *
 * Cross-isolate fan-out for asset-status events and Replicache pokes
 * without Redis pub/sub. Emitters INSERT a row; edge SSE endpoints poll
 * (`WHERE user_id = ? AND id > ?`) and forward new rows to the client.
 *
 * Rows are ephemeral (pruned after minutes) — this is a transport, not a
 * log. Consumers track their own cursor (`afterId`); global bigserial ids
 * order correctly per user because the poll filters on `(user_id, id)`.
 */
export type RealtimeEventKind = 'asset-status' | 'poke';

export const realtimeEvents = pgTable(
  'realtime_event',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<RealtimeEventKind>(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('realtime_event_user_id_idx').on(t.userId, t.id),
    index('realtime_event_created_at_idx').on(t.createdAt),
  ],
);

export type RealtimeEventRow = typeof realtimeEvents.$inferSelect;
export type RealtimeEventInsert = typeof realtimeEvents.$inferInsert;
