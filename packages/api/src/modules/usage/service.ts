import { db } from '@milkpod/db';
import { dailyUsage } from '@milkpod/db/schemas';
import { createId } from '@milkpod/db/helpers';
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
    if (toReserve === 0) return 0;

    // CTE snapshots the old words_used before the upsert so we can compute
    // the exact delta. RETURNING only sees the post-update row, so without
    // this the LEAST() clamp makes `newTotal - toReserve` unreliable
    // (e.g. prev=1990, reserve=50, budget=2000 → new=2000, naive prev=1950).
    const id = createId('usg');
    const result = await db().execute(sql`
      WITH prev AS (
        SELECT words_used AS old_used
        FROM daily_usage
        WHERE user_id = ${userId}
          AND usage_date = ${today}
        FOR UPDATE
      ),
      upserted AS (
        INSERT INTO daily_usage (id, user_id, usage_date, words_used, created_at, updated_at)
        VALUES (${id}, ${userId}, ${today}, LEAST(${toReserve}, ${DAILY_WORD_BUDGET}), NOW(), NOW())
        ON CONFLICT (user_id, usage_date) DO UPDATE
        SET words_used = LEAST(daily_usage.words_used + ${toReserve}, ${DAILY_WORD_BUDGET}),
            updated_at = NOW()
        RETURNING words_used
      )
      SELECT upserted.words_used - COALESCE((SELECT old_used FROM prev), 0) AS words_added
      FROM upserted
    `);

    const row = result.rows[0] as { words_added: number } | undefined;
    return Math.max(0, row?.words_added ?? 0);
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
