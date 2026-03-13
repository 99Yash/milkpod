import { api } from '~/lib/api';

/**
 * Module-level deduped cache for sidebar API calls.
 * Multiple sidebar components (SidebarPlanUsage, SidebarUserMenu) mount
 * simultaneously and each fetch billing/summary + usage/remaining.
 * This cache ensures concurrent callers share a single inflight request,
 * and results are reused for a short TTL window.
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TTL_MS = 30_000; // 30 seconds

let billingSummaryCache: CacheEntry<BillingSummary | null> | null = null;
let billingSummaryInflight: Promise<BillingSummary | null> | null = null;

let usageRemainingCache: CacheEntry<UsageRemaining | null> | null = null;
let usageRemainingInflight: Promise<UsageRemaining | null> | null = null;

let usageStatsCache: CacheEntry<UsageStats | null> | null = null;
let usageStatsInflight: Promise<UsageStats | null> | null = null;

export type BillingSummary = { plan: string; [key: string]: unknown };
export type UsageRemaining = { remaining: number; budget: number; isAdmin: boolean };
export type UsageStats = { videoCount: number; totalMinutes: number };

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

export async function fetchBillingSummary(): Promise<BillingSummary | null> {
  if (isFresh(billingSummaryCache)) return billingSummaryCache.data;
  if (billingSummaryInflight) return billingSummaryInflight;

  billingSummaryInflight = api.api.billing.summary
    .get()
    .then(({ data }) => {
      const result = data && 'plan' in data ? (data as BillingSummary) : null;
      billingSummaryCache = { data: result, timestamp: Date.now() };
      return result;
    })
    .catch(() => null)
    .finally(() => {
      billingSummaryInflight = null;
    });

  return billingSummaryInflight;
}

export async function fetchUsageRemaining(): Promise<UsageRemaining | null> {
  if (isFresh(usageRemainingCache)) return usageRemainingCache.data;
  if (usageRemainingInflight) return usageRemainingInflight;

  usageRemainingInflight = api.api.usage.remaining
    .get()
    .then(({ data }) => {
      const result = data ? (data as UsageRemaining) : null;
      usageRemainingCache = { data: result, timestamp: Date.now() };
      return result;
    })
    .catch(() => null)
    .finally(() => {
      usageRemainingInflight = null;
    });

  return usageRemainingInflight;
}

export async function fetchUsageStats(): Promise<UsageStats | null> {
  if (isFresh(usageStatsCache)) return usageStatsCache.data;
  if (usageStatsInflight) return usageStatsInflight;

  usageStatsInflight = api.api.usage.stats
    .get()
    .then(({ data }) => {
      const result = data ? (data as UsageStats) : null;
      usageStatsCache = { data: result, timestamp: Date.now() };
      return result;
    })
    .catch(() => null)
    .finally(() => {
      usageStatsInflight = null;
    });

  return usageStatsInflight;
}

/** Force refresh on next call (e.g. after plan change). */
export function invalidateSidebarCache() {
  billingSummaryCache = null;
  usageRemainingCache = null;
  usageStatsCache = null;
}
