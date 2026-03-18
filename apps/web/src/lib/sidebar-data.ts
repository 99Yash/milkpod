import { api } from '~/lib/api';

/**
 * Module-level deduped cache for sidebar API calls.
 * Multiple sidebar components (SidebarPlanUsage, SidebarUserMenu) mount
 * simultaneously and each fetch billing/summary.
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

let usageStatsCache: CacheEntry<UsageStats | null> | null = null;
let usageStatsInflight: Promise<UsageStats | null> | null = null;

export type BillingSummary = {
  plan: string;
  isAdmin: boolean;
  usage: {
    dailyWords: { used: number; limit: number; remaining: number };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
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
  usageStatsCache = null;
}
