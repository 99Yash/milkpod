import { db } from '@milkpod/db';
import {
  billingCustomers,
  billingSubscriptions,
  billingWebhookEvents,
  dailyUsage,
  monthlyUsage,
} from '@milkpod/db/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  resolveUserPlan,
  getQuotaForPlan,
  getEntitlementsForPlan,
  type PlanId,
  type PlanEntitlements,
} from '../quota/plans';
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

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function normalizePlanId(planId: string | null | undefined): PlanId {
  if (planId === 'pro' || planId === 'team') {
    return planId;
  }
  return 'free';
}

function isSubscriptionStatus(value: unknown): value is SubscriptionInfo['status'] {
  return (
    value === 'trialing'
    || value === 'active'
    || value === 'past_due'
    || value === 'canceled'
    || value === 'incomplete'
  );
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
    const today = todayUTC();
    const period = currentPeriod();

    const result = await db().execute(sql<{
      planId: string | null;
      subscriptionStatus: SubscriptionInfo['status'] | null;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean | null;
      canceledAt: Date | null;
      wordsUsed: number | null;
      videoMinutesUsed: number | null;
      visualSegmentsUsed: number | null;
      commentsGenerated: number | null;
    }>`
      with active_subscription as (
        select
          ${billingSubscriptions.planId} as "planId",
          ${billingSubscriptions.status} as "subscriptionStatus",
          ${billingSubscriptions.currentPeriodStart} as "currentPeriodStart",
          ${billingSubscriptions.currentPeriodEnd} as "currentPeriodEnd",
          ${billingSubscriptions.cancelAtPeriodEnd} as "cancelAtPeriodEnd",
          ${billingSubscriptions.canceledAt} as "canceledAt"
        from ${billingSubscriptions}
        where
          ${billingSubscriptions.userId} = ${userId}
          and ${billingSubscriptions.status} in ('active', 'trialing')
        limit 1
      )
      select
        active_subscription."planId",
        active_subscription."subscriptionStatus",
        active_subscription."currentPeriodStart",
        active_subscription."currentPeriodEnd",
        active_subscription."cancelAtPeriodEnd",
        active_subscription."canceledAt",
        coalesce(${dailyUsage.wordsUsed}, 0)::int as "wordsUsed",
        coalesce(${monthlyUsage.videoMinutesUsed}, 0)::int as "videoMinutesUsed",
        coalesce(${monthlyUsage.visualSegmentsUsed}, 0)::int as "visualSegmentsUsed",
        coalesce(${monthlyUsage.commentsGenerated}, 0)::int as "commentsGenerated"
      from (select 1) as one
      left join active_subscription on true
      left join ${dailyUsage}
        on ${dailyUsage.userId} = ${userId}
       and ${dailyUsage.usageDate} = ${today}
      left join ${monthlyUsage}
        on ${monthlyUsage.userId} = ${userId}
       and ${monthlyUsage.periodStart} = ${period}
    `);

    const row = result.rows[0] as Record<string, unknown> | undefined;

    const plan = normalizePlanId(
      typeof row?.planId === 'string' ? row.planId : null,
    );
    const dailyWords = Number(row?.wordsUsed ?? 0);
    const usedVideoMinutes = Number(row?.videoMinutesUsed ?? 0);
    const usedVisualSegments = Number(row?.visualSegmentsUsed ?? 0);
    const usedComments = Number(row?.commentsGenerated ?? 0);

    const subscriptionStatus = row?.subscriptionStatus;
    const currentPeriodStart = row?.currentPeriodStart;
    const currentPeriodEnd = row?.currentPeriodEnd;
    const canceledAt = row?.canceledAt;

    const subscription = isSubscriptionStatus(subscriptionStatus)
      ? {
          status: subscriptionStatus,
          currentPeriodStart:
            currentPeriodStart instanceof Date
              ? currentPeriodStart.toISOString()
              : null,
          currentPeriodEnd:
            currentPeriodEnd instanceof Date
              ? currentPeriodEnd.toISOString()
              : null,
          cancelAtPeriodEnd: row?.cancelAtPeriodEnd === true,
          canceledAt: canceledAt instanceof Date ? canceledAt.toISOString() : null,
        }
      : null;

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
          used: usedVideoMinutes,
          limit: quotas.videoMinutesMonthly,
          remaining: Math.max(0, quotas.videoMinutesMonthly - usedVideoMinutes),
        },
        monthlyVisualSegments: {
          used: usedVisualSegments,
          limit: quotas.visualSegmentsMonthly,
          remaining: Math.max(0, quotas.visualSegmentsMonthly - usedVisualSegments),
        },
        monthlyComments: {
          used: usedComments,
          limit: quotas.commentsMonthly,
          remaining: Math.max(0, quotas.commentsMonthly - usedComments),
        },
      },
      entitlements,
    };
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
        providerCustomerId: billingCustomers.providerCustomerId,
      })
      .from(billingSubscriptions)
      .innerJoin(
        billingCustomers,
        eq(billingCustomers.userId, billingSubscriptions.userId),
      )
      .where(
        and(
          eq(billingSubscriptions.userId, userId),
          inArray(billingSubscriptions.status, [...ACTIVE_STATUSES]),
        ),
      )
      .limit(1);

    return row ?? null;
  }
}
