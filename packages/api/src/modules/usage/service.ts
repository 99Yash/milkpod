import { db } from '@milkpod/db';
import { billingSubscriptions, dailyUsage, mediaAssets } from '@milkpod/db/schemas';
import { and, eq, sql, count, sum } from 'drizzle-orm';
import { DAILY_WORD_BUDGET } from '@milkpod/ai';
import { serverEnv } from '@milkpod/env/server';
import { getEntitlementsForPlan, type PlanId } from '../quota/plans';

type RemainingSummary = {
  budget: number;
  remaining: number;
};

type UsageStats = {
  videoCount: number;
  totalMinutes: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const REMAINING_CACHE_TTL_MS = 10_000;
const STATS_CACHE_TTL_MS = 30_000;
const MAX_USAGE_CACHE_SIZE = 2_000;

const remainingCache = new Map<string, CacheEntry<RemainingSummary>>();
const remainingInflight = new Map<string, Promise<RemainingSummary>>();

const statsCache = new Map<string, CacheEntry<UsageStats>>();
const statsInflight = new Map<string, Promise<UsageStats>>();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizePlanId(planId: string | null | undefined): PlanId {
  if (planId === 'pro' || planId === 'team') {
    return planId;
  }
  return 'free';
}

export function isAdminEmail(email: string): boolean {
  const raw = serverEnv().ADMIN_EMAILS;
  if (!raw) return false;
  const list = raw.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (cache.size >= MAX_USAGE_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function invalidateRemainingCache(userId: string): void {
  remainingCache.delete(userId);
  remainingInflight.delete(userId);
}

async function fetchRemainingWordsSummary(userId: string): Promise<RemainingSummary> {
  const today = todayUTC();

  const result = await db().execute(sql<{
    planId: string | null;
    wordsUsed: number | null;
  }>`
    with active_subscription as (
      select ${billingSubscriptions.planId} as "planId"
      from ${billingSubscriptions}
      where
        ${billingSubscriptions.userId} = ${userId}
        and ${billingSubscriptions.status} in ('active', 'trialing')
      limit 1
    )
    select
      active_subscription."planId",
      coalesce(${dailyUsage.wordsUsed}, 0)::int as "wordsUsed"
    from (select 1) as one
    left join active_subscription on true
    left join ${dailyUsage}
      on ${dailyUsage.userId} = ${userId}
     and ${dailyUsage.usageDate} = ${today}
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  const plan = normalizePlanId(
    typeof row?.planId === 'string' ? row.planId : null,
  );
  const budget = getEntitlementsForPlan(plan).aiWordsDaily;
  const used = Number(row?.wordsUsed ?? 0);

  return {
    budget,
    remaining: Math.max(0, budget - used),
  };
}

async function fetchUserStats(userId: string): Promise<UsageStats> {
  const [row] = await db()
    .select({
      videoCount: count(mediaAssets.id),
      totalSeconds: sum(mediaAssets.duration),
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId));

  return {
    videoCount: row?.videoCount ?? 0,
    totalMinutes: Math.round((Number(row?.totalSeconds) || 0) / 60),
  };
}

export async function getRemainingWordsSummary(userId: string): Promise<{
  budget: number;
  remaining: number;
}> {
  const cached = readCache(remainingCache, userId);
  if (cached) return cached;

  const inflight = remainingInflight.get(userId);
  if (inflight) return inflight;

  const request = fetchRemainingWordsSummary(userId)
    .then((result) => {
      writeCache(remainingCache, userId, result, REMAINING_CACHE_TTL_MS);
      return result;
    })
    .finally(() => {
      remainingInflight.delete(userId);
    });

  remainingInflight.set(userId, request);
  return request;
}

export abstract class UsageService {
  static async getRemainingWords(userId: string, dailyBudget?: number): Promise<number> {
    const today = todayUTC();
    const budget = dailyBudget ?? DAILY_WORD_BUDGET;
    const [row] = await db()
      .select({ wordsUsed: dailyUsage.wordsUsed })
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, today)));

    const used = row?.wordsUsed ?? 0;
    return Math.max(0, budget - used);
  }

  /**
   * Atomically reserve words for a request. Uses a per-user advisory lock
   * to serialize concurrent reservations — prevents the race condition where
   * parallel requests both pass the budget check before either is counted.
   * Returns the number of words actually reserved (may be less than requested
   * if near the cap). Returns 0 when the budget is exhausted.
   */
  static async reserveWords(userId: string, wordCount: number, dailyBudget?: number): Promise<number> {
    const today = todayUTC();
    const budget = dailyBudget ?? DAILY_WORD_BUDGET;
    const toReserve = Math.max(0, wordCount);
    if (toReserve === 0) return 0;

    const reserved = await db().transaction(async (tx) => {
      // Advisory lock serializes all usage operations for this user.
      // Prevents concurrent requests from double-spending the quota.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage:${userId}`}))`);

      const [row] = await tx
        .select({ wordsUsed: dailyUsage.wordsUsed })
        .from(dailyUsage)
        .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, today)));

      const currentUsed = row?.wordsUsed ?? 0;
      const available = Math.max(0, budget - currentUsed);
      const toAdd = Math.min(toReserve, available);

      if (toAdd <= 0) return 0;

      if (row) {
        await tx
          .update(dailyUsage)
          .set({ wordsUsed: currentUsed + toAdd })
          .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, today)));
      } else {
        await tx.insert(dailyUsage).values({
          userId,
          usageDate: today,
          wordsUsed: toAdd,
        });
      }

      return toAdd;
    });

    invalidateRemainingCache(userId);
    return reserved;
  }

  static async getUserStats(userId: string): Promise<{ videoCount: number; totalMinutes: number }> {
    const cached = readCache(statsCache, userId);
    if (cached) return cached;

    const inflight = statsInflight.get(userId);
    if (inflight) return inflight;

    const request = fetchUserStats(userId)
      .then((result) => {
        writeCache(statsCache, userId, result, STATS_CACHE_TTL_MS);
        return result;
      })
      .finally(() => {
        statsInflight.delete(userId);
      });

    statsInflight.set(userId, request);
    return request;
  }

  /**
   * Release unused reserved words back to the budget.
   * Called after streaming when actual usage < reserved amount.
   * Uses the same advisory lock as reserveWords to prevent interleaving.
   */
  static async releaseWords(userId: string, wordCount: number): Promise<void> {
    if (wordCount <= 0) return;
    const today = todayUTC();

    await db().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage:${userId}`}))`);

      await tx.execute(sql`
        UPDATE daily_usage
        SET words_used = GREATEST(words_used - ${wordCount}, 0),
            updated_at = NOW()
        WHERE user_id = ${userId}
          AND usage_date = ${today}
      `);
    });

    invalidateRemainingCache(userId);
  }
}
