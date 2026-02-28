import { db } from '@milkpod/db';
import { dailyUsage } from '@milkpod/db/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { DAILY_WORD_BUDGET } from '@milkpod/ai';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
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
   * Atomically reserve words for a request. Returns the number of words
   * actually reserved (may be less than requested if near the cap).
   * Returns 0 when the budget is exhausted — callers should reject the request.
   */
  static async reserveWords(userId: string, wordCount: number): Promise<number> {
    const today = todayUTC();
    const toReserve = Math.max(0, wordCount);

    // Upsert with an atomic clamp: only add up to what the budget allows.
    const [row] = await db()
      .insert(dailyUsage)
      .values({ userId, usageDate: today, wordsUsed: toReserve })
      .onConflictDoUpdate({
        target: [dailyUsage.userId, dailyUsage.usageDate],
        set: {
          wordsUsed: sql`LEAST(${dailyUsage.wordsUsed} + ${toReserve}, ${DAILY_WORD_BUDGET})`,
        },
      })
      .returning({ wordsUsed: dailyUsage.wordsUsed });

    // Derive how many words were actually added
    const newTotal = row?.wordsUsed ?? toReserve;
    const previousTotal = newTotal - toReserve;
    // If previousTotal was already >= budget, nothing was added
    if (previousTotal >= DAILY_WORD_BUDGET) return 0;
    return Math.min(toReserve, DAILY_WORD_BUDGET - Math.max(0, previousTotal));
  }

  static async recordUsage(userId: string, wordCount: number): Promise<void> {
    const today = todayUTC();
    await db()
      .insert(dailyUsage)
      .values({ userId, usageDate: today, wordsUsed: wordCount })
      .onConflictDoUpdate({
        target: [dailyUsage.userId, dailyUsage.usageDate],
        set: { wordsUsed: sql`${dailyUsage.wordsUsed} + ${wordCount}` },
      });
  }
}
