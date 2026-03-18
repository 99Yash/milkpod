/**
 * Module-level cache for plan ID and usage counters.
 *
 * Populated by:
 * 1. `fetchBillingSummary()` on dashboard mount (sidebar)
 * 2. `X-Plan` response header from chat endpoint
 *
 * Consumed by:
 * - ChatPanel / ModelPicker — compute `allowedModelIds` locally
 * - UrlInputForm — client-side video quota pre-check
 * - DailyQuota — plan-aware budget display
 */
import {
  getEntitlementsForPlan,
  getQuotaForPlan,
  type PlanId,
  type PlanEntitlements,
  type QuotaUnit,
} from '@milkpod/ai/plans';

let cachedPlan: PlanId | null = null;

// Monthly usage counters (populated from billing summary)
let monthlyUsage: Record<QuotaUnit, number> = {
  video_minutes: 0,
  visual_segments: 0,
  comments: 0,
};
let monthlyUsageLoaded = false;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function getCachedPlan(): PlanId | null {
  return cachedPlan;
}

export function setCachedPlan(plan: PlanId): void {
  cachedPlan = plan;
}

export function getCachedEntitlements(): PlanEntitlements | null {
  if (!cachedPlan) return null;
  return getEntitlementsForPlan(cachedPlan);
}

export function getCachedAllowedModelIds(): string[] | null {
  return getCachedEntitlements()?.allowedModelIds ?? null;
}

// ---------------------------------------------------------------------------
// Monthly usage
// ---------------------------------------------------------------------------

export function setMonthlyUsage(used: { videoMinutes: number; visualSegments: number; comments: number }): void {
  monthlyUsage = {
    video_minutes: used.videoMinutes,
    visual_segments: used.visualSegments,
    comments: used.comments,
  };
  monthlyUsageLoaded = true;
}

export function incrementMonthlyUsage(unit: QuotaUnit, amount: number): void {
  monthlyUsage[unit] += amount;
}

/**
 * Client-side quota pre-check. Returns `{ allowed: true }` or a rejection
 * with the current usage / limit. Returns `null` when the cache hasn't been
 * populated yet (caller should let the server decide).
 */
export function checkQuotaLocal(unit: QuotaUnit): {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
} | null {
  if (!cachedPlan || !monthlyUsageLoaded) return null;
  const quotas = getQuotaForPlan(cachedPlan);
  const limitMap: Record<QuotaUnit, number> = {
    video_minutes: quotas.videoMinutesMonthly,
    visual_segments: quotas.visualSegmentsMonthly,
    comments: quotas.commentsMonthly,
  };
  const limit = limitMap[unit];
  const used = monthlyUsage[unit];
  const remaining = Math.max(0, limit - used);
  return { allowed: remaining > 0, used, limit, remaining };
}
