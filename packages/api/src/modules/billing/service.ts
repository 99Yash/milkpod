import { db } from '@milkpod/db';
import { billingCustomers, billingSubscriptions } from '@milkpod/db/schemas';
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
}
