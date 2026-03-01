import { db } from '@milkpod/db';
import { dailyUsage } from '@milkpod/db/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { DAILY_WORD_BUDGET } from '@milkpod/ai';
import { serverEnv } from '@milkpod/env/server';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isAdminEmail(email: string): boolean {
  const raw = serverEnv().ADMIN_EMAILS;
  if (!raw) return false;
  const list = raw.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export abstract class UsageService {
  static async getRemainingWords(userId: string): Promise<number> {
    const today = todayUTC();
    const [row] = await db()
      .select({ wordsUsed: dailyUsage.wordsUsed })
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, today)));

    const used = row?.wordsUsed ?? 0;
    return Math.max(0, DAILY_WORD_BUDGET - used);
  }

  /**
   * Atomically reserve words for a request. Uses a per-user advisory lock
   * to serialize concurrent reservations — prevents the race condition where
   * parallel requests both pass the budget check before either is counted.
   * Returns the number of words actually reserved (may be less than requested
   * if near the cap). Returns 0 when the budget is exhausted.
   */
  static async reserveWords(userId: string, wordCount: number): Promise<number> {
    const today = todayUTC();
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
      const available = Math.max(0, DAILY_WORD_BUDGET - currentUsed);
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
