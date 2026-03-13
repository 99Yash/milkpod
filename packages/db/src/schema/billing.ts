import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { createId, lifecycle_dates } from '../helpers';
import { user } from './auth';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const billingProviderEnum = pgEnum('billing_provider', ['polar', 'razorpay']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);

// ---------------------------------------------------------------------------
// billing_customer — links a user to a payment provider account
// ---------------------------------------------------------------------------

export const billingCustomers = pgTable('billing_customer', {
  id: text('id').primaryKey().$defaultFn(() => createId('bcust')),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: billingProviderEnum('provider').notNull(),
  providerCustomerId: text('provider_customer_id').notNull(),
  ...lifecycle_dates,
}, (t) => [
  unique('billing_customer_user_id_unique').on(t.userId),
  unique('billing_customer_provider_customer_id_unique').on(t.providerCustomerId),
]);

// ---------------------------------------------------------------------------
// billing_subscription — active / past subscriptions
// ---------------------------------------------------------------------------

export const billingSubscriptions = pgTable('billing_subscription', {
  id: text('id').primaryKey().$defaultFn(() => createId('bsub')),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: billingProviderEnum('provider').notNull(),
  providerSubscriptionId: text('provider_subscription_id').notNull(),
  planId: text('plan_id').notNull(), // 'free' | 'pro' | 'team'
  status: subscriptionStatusEnum('status').notNull(),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  canceledAt: timestamp('canceled_at'),
  ...lifecycle_dates,
}, (t) => [
  unique('billing_subscription_provider_sub_id_unique').on(t.providerSubscriptionId),
  index('billing_subscription_user_id_idx').on(t.userId),
  index('billing_subscription_user_status_idx').on(t.userId, t.status),
]);

// ---------------------------------------------------------------------------
// billing_webhook_event — idempotent webhook audit log
// ---------------------------------------------------------------------------

export const billingWebhookEvents = pgTable('billing_webhook_event', {
  id: text('id').primaryKey().$defaultFn(() => createId('bevt')),
  provider: billingProviderEnum('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at'),
  ...lifecycle_dates,
}, (t) => [
  unique('billing_webhook_event_provider_event_id_unique').on(t.providerEventId),
]);
