import { db } from '@milkpod/db';
import { monthlyUsage } from '@milkpod/db/schemas';
import { and, eq, sql, sum } from 'drizzle-orm';
import { resolveUserPlan, getQuotaForPlan, type PlanId, type QuotaUnit, type MultimodalQuota } from './plans';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export type QuotaCheck = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unit: QuotaUnit;
};

export type MonthlyUsageSnapshot = {
  planId: PlanId;
  videoMinutesUsed: number;
  visualSegmentsUsed: number;
  commentsGenerated: number;
  limits: MultimodalQuota;
  periodStart: string;
};

export abstract class QuotaService {
  /**
   * Get the current month's usage counters for a user.
   */
  static async getMonthlyUsage(userId: string): Promise<MonthlyUsageSnapshot> {
    const period = currentPeriod();
    const plan = await resolveUserPlan(userId);
    const limits = getQuotaForPlan(plan);

    const [row] = await db()
      .select({
        videoMinutesUsed: monthlyUsage.videoMinutesUsed,
        visualSegmentsUsed: monthlyUsage.visualSegmentsUsed,
        commentsGenerated: monthlyUsage.commentsGenerated,
      })
      .from(monthlyUsage)
      .where(and(eq(monthlyUsage.userId, userId), eq(monthlyUsage.periodStart, period)));

    return {
      planId: plan,
      videoMinutesUsed: row?.videoMinutesUsed ?? 0,
      visualSegmentsUsed: row?.visualSegmentsUsed ?? 0,
      commentsGenerated: row?.commentsGenerated ?? 0,
      limits,
      periodStart: period,
    };
  }

  /**
   * Check whether a user has remaining quota for the given unit.
   * Does NOT mutate — use this for soft pre-checks before starting work.
   */
  static async checkQuota(userId: string, unit: QuotaUnit, requested = 1): Promise<QuotaCheck> {
    const usage = await QuotaService.getMonthlyUsage(userId);
    const { used, limit } = mapUnitToFields(usage, unit);
    const remaining = Math.max(0, limit - used);

    return {
      allowed: remaining >= requested,
      used,
      limit,
      remaining,
      unit,
    };
  }

  /**
   * Atomically increment a usage counter. Uses advisory lock to prevent races.
   * Returns the new total for that unit.
   */
  static async increment(userId: string, unit: QuotaUnit, amount: number): Promise<number> {
    if (amount <= 0) return 0;
    const period = currentPeriod();
    const column = unitToColumn(unit);

    return await db().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`quota:${userId}:${period}`}))`);

      const [existing] = await tx
        .select({ id: monthlyUsage.id, [column]: monthlyUsage[column] })
        .from(monthlyUsage)
        .where(and(eq(monthlyUsage.userId, userId), eq(monthlyUsage.periodStart, period)));

      if (existing) {
        const [updated] = await tx
          .update(monthlyUsage)
          .set({ [column]: sql`${monthlyUsage[column]} + ${amount}` })
          .where(eq(monthlyUsage.id, existing.id))
          .returning({ val: monthlyUsage[column] });
        return updated?.val ?? 0;
      }

      const [inserted] = await tx
        .insert(monthlyUsage)
        .values({
          userId,
          periodStart: period,
          [column]: amount,
        })
        .returning({ val: monthlyUsage[column] });
      return inserted?.val ?? 0;
    });
  }

  /**
   * Admin: aggregate quota stats across all users for the current period.
   */
  static async getAggregateStats() {
    const period = currentPeriod();
    const [row] = await db()
      .select({
        totalVideoMinutes: sum(monthlyUsage.videoMinutesUsed).mapWith(Number),
        totalVisualSegments: sum(monthlyUsage.visualSegmentsUsed).mapWith(Number),
        totalComments: sum(monthlyUsage.commentsGenerated).mapWith(Number),
        activeUsers: sql<number>`count(distinct ${monthlyUsage.userId})`.mapWith(Number),
      })
      .from(monthlyUsage)
      .where(eq(monthlyUsage.periodStart, period));

    return {
      periodStart: period,
      totalVideoMinutes: row?.totalVideoMinutes ?? 0,
      totalVisualSegments: row?.totalVisualSegments ?? 0,
      totalComments: row?.totalComments ?? 0,
      activeUsers: row?.activeUsers ?? 0,
    };
  }
}

function unitToColumn(unit: QuotaUnit) {
  switch (unit) {
    case 'video_minutes': return 'videoMinutesUsed' as const;
    case 'visual_segments': return 'visualSegmentsUsed' as const;
    case 'comments': return 'commentsGenerated' as const;
    default: { const _exhaustive: never = unit; throw new Error(`Unknown quota unit: ${_exhaustive}`); }
  }
}

function mapUnitToFields(usage: MonthlyUsageSnapshot, unit: QuotaUnit) {
  switch (unit) {
    case 'video_minutes':
      return { used: usage.videoMinutesUsed, limit: usage.limits.videoMinutesMonthly };
    case 'visual_segments':
      return { used: usage.visualSegmentsUsed, limit: usage.limits.visualSegmentsMonthly };
    case 'comments':
      return { used: usage.commentsGenerated, limit: usage.limits.commentsMonthly };
    default: { const _exhaustive: never = unit; throw new Error(`Unknown quota unit: ${_exhaustive}`); }
  }
}
