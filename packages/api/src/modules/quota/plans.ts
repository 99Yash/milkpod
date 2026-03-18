import { db } from '@milkpod/db';
import { billingSubscriptions } from '@milkpod/db/schemas';
import { and, eq, inArray } from 'drizzle-orm';

// Re-export all static plan config from the client-safe shared module.
// This keeps entitlement definitions in one place (`@milkpod/ai/plans`)
// while the server-only `resolveUserPlan` stays here (needs DB).
export {
  type PlanId,
  type MultimodalQuota,
  type QuotaUnit,
  type PlanEntitlements,
  getQuotaForPlan,
  getEntitlementsForPlan,
} from '@milkpod/ai/plans';

import type { PlanId } from '@milkpod/ai/plans';

// ---------------------------------------------------------------------------
// Resolve a user's plan from billing_subscription
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = ['active', 'trialing'] as const;

/**
 * Query billing_subscription for an active/trialing subscription.
 * Falls back to 'free' when no paid subscription exists.
 */
export async function resolveUserPlan(userId: string): Promise<PlanId> {
  const [row] = await db()
    .select({ planId: billingSubscriptions.planId })
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        inArray(billingSubscriptions.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (row && (row.planId === 'pro' || row.planId === 'team')) {
    return row.planId;
  }
  return 'free';
}
