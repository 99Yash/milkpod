import { db } from '@milkpod/db';
import { billingSubscriptions, dailyUsage, mediaAssets } from '@milkpod/db/schemas';
import { and, eq, sql, count, sum } from 'drizzle-orm';
import { DAILY_WORD_BUDGET } from '@milkpod/ai';
import { serverEnv } from '@milkpod/env/server';
import { getEntitlementsForPlan, type PlanId } from '../quota/plans';

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

export async function getRemainingWordsSummary(userId: string): Promise<{
  budget: number;
  remaining: number;
}> {
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

    return await db().transaction(async (tx) => {
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
  }

  static async getUserStats(userId: string): Promise<{ videoCount: number; totalMinutes: number }> {
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
  }
}
