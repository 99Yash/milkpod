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
