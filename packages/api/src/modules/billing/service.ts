import { db } from '@milkpod/db';
import {
  billingCustomers,
  billingSubscriptions,
  billingWebhookEvents,
} from '@milkpod/db/schemas';
import { dailyUsage } from '@milkpod/db/schemas';
import { and, eq, inArray } from 'drizzle-orm';
import {
  resolveUserPlan,
  getQuotaForPlan,
  getEntitlementsForPlan,
  type PlanId,
  type PlanEntitlements,
} from '../quota/plans';
import { QuotaService } from '../quota/service';
import type { NormalizedWebhookEvent } from './provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubscriptionInfo = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
};

export type BillingSummary = {
  plan: PlanId;
  subscription: SubscriptionInfo | null;
  usage: {
    dailyWords: { used: number; limit: number; remaining: number };
    monthlyVideoMinutes: { used: number; limit: number; remaining: number };
    monthlyVisualSegments: { used: number; limit: number; remaining: number };
    monthlyComments: { used: number; limit: number; remaining: number };
  };
  entitlements: PlanEntitlements;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = ['active', 'trialing'] as const;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export abstract class BillingService {
  /**
   * Get the user's active subscription row, if any.
   */
  static async getActiveSubscription(userId: string): Promise<SubscriptionInfo | null> {
    const [row] = await db()
      .select({
        status: billingSubscriptions.status,
        currentPeriodStart: billingSubscriptions.currentPeriodStart,
        currentPeriodEnd: billingSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd,
        canceledAt: billingSubscriptions.canceledAt,
      })
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, userId),
          inArray(billingSubscriptions.status, [...ACTIVE_STATUSES]),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      status: row.status,
      currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      canceledAt: row.canceledAt?.toISOString() ?? null,
    };
  }

  /**
   * Check if a provider customer record exists for a user.
   */
  static async getCustomer(userId: string) {
    const [row] = await db()
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Resolve a user's full entitlements from their plan.
   */
  static async getUserEntitlements(userId: string): Promise<PlanEntitlements> {
    const plan = await resolveUserPlan(userId);
    return getEntitlementsForPlan(plan);
  }

  /**
   * Build a full billing summary for a user.
   */
  static async getSummary(userId: string): Promise<BillingSummary> {
    const [plan, subscription, monthlyUsage, dailyWords] = await Promise.all([
      resolveUserPlan(userId),
      BillingService.getActiveSubscription(userId),
      QuotaService.getMonthlyUsage(userId),
      BillingService.getDailyWordUsage(userId),
    ]);

    const entitlements = getEntitlementsForPlan(plan);
    const quotas = getQuotaForPlan(plan);

    return {
      plan,
      subscription,
      usage: {
        dailyWords: {
          used: dailyWords,
          limit: entitlements.aiWordsDaily,
          remaining: Math.max(0, entitlements.aiWordsDaily - dailyWords),
        },
        monthlyVideoMinutes: {
          used: monthlyUsage.videoMinutesUsed,
          limit: quotas.videoMinutesMonthly,
          remaining: Math.max(0, quotas.videoMinutesMonthly - monthlyUsage.videoMinutesUsed),
        },
        monthlyVisualSegments: {
          used: monthlyUsage.visualSegmentsUsed,
          limit: quotas.visualSegmentsMonthly,
          remaining: Math.max(0, quotas.visualSegmentsMonthly - monthlyUsage.visualSegmentsUsed),
        },
        monthlyComments: {
          used: monthlyUsage.commentsGenerated,
          limit: quotas.commentsMonthly,
          remaining: Math.max(0, quotas.commentsMonthly - monthlyUsage.commentsGenerated),
        },
      },
      entitlements,
    };
  }

  /**
   * Get today's word usage for a user.
   */
  private static async getDailyWordUsage(userId: string): Promise<number> {
    const today = todayUTC();
    const [row] = await db()
      .select({ wordsUsed: dailyUsage.wordsUsed })
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, today)));

    return row?.wordsUsed ?? 0;
  }

  // -------------------------------------------------------------------------
  // Webhook processing
  // -------------------------------------------------------------------------

  /**
   * Check if a webhook event has already been processed (idempotency).
   * Returns true if the event is a duplicate.
   */
  static async isEventProcessed(providerEventId: string): Promise<boolean> {
    const [row] = await db()
      .select({ id: billingWebhookEvents.id })
      .from(billingWebhookEvents)
      .where(eq(billingWebhookEvents.providerEventId, providerEventId))
      .limit(1);
    return !!row;
  }

  /**
   * Process a normalized webhook event in a transaction:
   * 1. Insert webhook event row (idempotency guard)
   * 2. Apply state transition (upsert customer + subscription)
   * 3. Mark event as processed
   */
  static async processWebhookEvent(
    event: NormalizedWebhookEvent,
    provider: 'polar' | 'razorpay',
  ): Promise<void> {
    await db().transaction(async (tx) => {
      // 1. Insert webhook event — unique constraint on providerEventId
      //    acts as idempotency guard (caller should pre-check to avoid noise)
      await tx.insert(billingWebhookEvents).values({
        provider,
        providerEventId: event.providerEventId,
        eventType: event.type,
        payload: event.rawPayload as Record<string, unknown>,
        processedAt: new Date(),
      });

      // 2. Resolve the user from their billing customer or create one
      //    For checkout.completed: look up user by email or metadata
      //    For other events: look up user by provider customer ID
      let userId: string | null = null;

      const existingCustomer = await tx
        .select({ userId: billingCustomers.userId })
        .from(billingCustomers)
        .where(eq(billingCustomers.providerCustomerId, event.customerId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (existingCustomer) {
        userId = existingCustomer.userId;
      }

      if (event.type === 'checkout.completed' && !userId && event.email) {
        // Look up user by email from auth (import would create circular dep,
        // so we query the user table directly)
        const { user } = await import('@milkpod/db/schemas');
        const [userRow] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, event.email))
          .limit(1);

        if (userRow) {
          userId = userRow.id;
          // Upsert billing customer
          await tx
            .insert(billingCustomers)
            .values({
              userId: userRow.id,
              provider,
              providerCustomerId: event.customerId,
            })
            .onConflictDoUpdate({
              target: billingCustomers.userId,
              set: {
                provider,
                providerCustomerId: event.customerId,
              },
            });
        }
      }

      if (!userId) {
        // Can't link this event to a user — log and skip
        console.warn(
          `[billing] Cannot resolve user for webhook event ${event.providerEventId}`,
        );
        return;
      }

      // 3. Apply state transition to billing_subscription
      switch (event.type) {
        case 'checkout.completed':
        case 'subscription.updated': {
          // Upsert subscription
          await tx
            .insert(billingSubscriptions)
            .values({
              userId,
              provider,
              providerSubscriptionId: event.subscriptionId,
              planId: event.planId,
              status: event.status,
              currentPeriodStart: event.currentPeriodStart,
              currentPeriodEnd: event.currentPeriodEnd,
              cancelAtPeriodEnd: event.cancelAtPeriodEnd,
            })
            .onConflictDoUpdate({
              target: billingSubscriptions.providerSubscriptionId,
              set: {
                planId: event.planId,
                status: event.status,
                currentPeriodStart: event.currentPeriodStart,
                currentPeriodEnd: event.currentPeriodEnd,
                cancelAtPeriodEnd: event.cancelAtPeriodEnd,
              },
            });
          break;
        }

        case 'subscription.canceled': {
          await tx
            .update(billingSubscriptions)
            .set({
              status: 'canceled',
              cancelAtPeriodEnd: event.cancelAtPeriodEnd,
              canceledAt: new Date(),
            })
            .where(
              eq(billingSubscriptions.providerSubscriptionId, event.subscriptionId),
            );
          break;
        }

        case 'payment.failed': {
          await tx
            .update(billingSubscriptions)
            .set({ status: 'past_due' })
            .where(
              eq(billingSubscriptions.providerSubscriptionId, event.subscriptionId),
            );
          break;
        }
      }
    });
  }

  /**
   * Get the provider subscription ID for a user's active subscription.
   * Used by cancel endpoint.
   */
  static async getActiveProviderSubscriptionId(
    userId: string,
  ): Promise<{ providerSubscriptionId: string; providerCustomerId: string } | null> {
    const [row] = await db()
      .select({
        providerSubscriptionId: billingSubscriptions.providerSubscriptionId,
      })
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, userId),
          inArray(billingSubscriptions.status, [...ACTIVE_STATUSES]),
        ),
      )
      .limit(1);

    if (!row) return null;

    const customer = await BillingService.getCustomer(userId);
    if (!customer) return null;

    return {
      providerSubscriptionId: row.providerSubscriptionId,
      providerCustomerId: customer.providerCustomerId,
    };
  }
}
