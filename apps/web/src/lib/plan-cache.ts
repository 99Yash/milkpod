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
let cachedIsAdmin: boolean | null = null;

// Monthly usage counters (populated from billing summary)
let monthlyUsage: Record<QuotaUnit, number> = {
  video_minutes: 0,
  visual_segments: 0,
  comments: 0,
};
let monthlyUsageLoaded = false;

// Collection count (populated from collections list query)
let collectionCount: number | null = null;

// Active share link count (populated from fetchShareLinks in ShareDialog)
let activeShareLinkCount: number | null = null;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'team';
}

export function getCachedPlan(): PlanId | null {
  return cachedPlan;
}

export function setCachedPlan(plan: PlanId): void {
  cachedPlan = plan;
}

export function getCachedIsAdmin(): boolean | null {
  return cachedIsAdmin;
}

export function setCachedIsAdmin(isAdmin: boolean): void {
  cachedIsAdmin = isAdmin;
}

export function getCachedEntitlements(): PlanEntitlements | null {
  if (!cachedPlan) return null;
  return getEntitlementsForPlan(cachedPlan);
}

export function getCachedAllowedModelIds(): string[] | null {
  if (cachedIsAdmin === true) return null;
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

// ---------------------------------------------------------------------------
// Collection count
// ---------------------------------------------------------------------------

export function setCollectionCount(n: number): void {
  collectionCount = n;
}

export function incrementCollectionCount(): void {
  if (collectionCount !== null) collectionCount++;
}

export function decrementCollectionCount(): void {
  if (collectionCount !== null && collectionCount > 0) collectionCount--;
}

/**
 * Client-side collection limit pre-check. Returns `null` when plan or count
 * is not yet loaded (caller should let the server decide).
 */
export function checkCollectionLimit(): {
  allowed: boolean;
  used: number;
  limit: number | null;
} | null {
  if (cachedIsAdmin === true) {
    return { allowed: true, used: collectionCount ?? 0, limit: null };
  }
  if (!cachedPlan || collectionCount === null) return null;
  const entitlements = getEntitlementsForPlan(cachedPlan);
  const limit = entitlements.maxCollections;
  // null = unlimited
  if (limit === null) return { allowed: true, used: collectionCount, limit };
  return { allowed: collectionCount < limit, used: collectionCount, limit };
}

// ---------------------------------------------------------------------------
// Active share link count
// ---------------------------------------------------------------------------

export function setActiveShareLinkCount(n: number): void {
  activeShareLinkCount = n;
}

export function incrementActiveShareLinkCount(): void {
  if (activeShareLinkCount !== null) activeShareLinkCount++;
}

export function decrementActiveShareLinkCount(): void {
  if (activeShareLinkCount !== null && activeShareLinkCount > 0) activeShareLinkCount--;
}

/**
 * Client-side share link limit pre-check. Returns `null` when plan or count
 * is not yet loaded (caller should let the server decide).
 */
export function checkShareLinkLimit(): {
  allowed: boolean;
  used: number;
  limit: number | null;
} | null {
  if (cachedIsAdmin === true) {
    return { allowed: true, used: activeShareLinkCount ?? 0, limit: null };
  }
  if (!cachedPlan || activeShareLinkCount === null) return null;
  const entitlements = getEntitlementsForPlan(cachedPlan);
  const limit = entitlements.maxActiveShareLinks;
  // null = unlimited
  if (limit === null) return { allowed: true, used: activeShareLinkCount, limit };
  return { allowed: activeShareLinkCount < limit, used: activeShareLinkCount, limit };
}

// ---------------------------------------------------------------------------
// Monthly usage
// ---------------------------------------------------------------------------

/**
 * Client-side quota pre-check. Returns `{ allowed: true }` or a rejection
 * with the current usage / limit. Returns `null` when the cache hasn't been
 * populated yet (caller should let the server decide).
 */
export function checkQuotaLocal(unit: QuotaUnit): {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
} | null {
  if (cachedIsAdmin === true) {
    return {
      allowed: true,
      used: monthlyUsage[unit],
      limit: null,
      remaining: null,
    };
  }
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
