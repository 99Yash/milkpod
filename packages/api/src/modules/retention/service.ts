import { db } from '@milkpod/db';
import { mediaAssets } from '@milkpod/db/schemas';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { deleteStoredUpload } from '../ingest/upload-storage';

export type PurgeResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ assetId: string; error: string }>;
};

export type RetentionStats = {
  expiredPending: number;
  purgedTotal: number;
  heldTotal: number;
};

export abstract class RetentionService {
  /**
   * Find upload assets whose raw media has expired and hasn't been purged yet,
   * excluding those under legal hold.
   */
  static async findExpiredUploads(limit = 100) {
    return db()
      .select({
        id: mediaAssets.id,
        sourceUrl: mediaAssets.sourceUrl,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.sourceType, 'upload'),
          lte(mediaAssets.rawMediaRetentionUntil, new Date()),
          isNull(mediaAssets.rawMediaDeletedAt),
          eq(mediaAssets.retentionHold, false),
        ),
      )
      .limit(limit);
  }

  /**
   * Purge expired raw media from object storage and mark assets as purged.
   * Returns metrics for observability.
   */
  static async purge(limit = 100): Promise<PurgeResult> {
    const expired = await RetentionService.findExpiredUploads(limit);

    const result: PurgeResult = {
      attempted: expired.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    for (const asset of expired) {
      try {
        if (asset.sourceUrl) {
          await deleteStoredUpload(asset.sourceUrl);
        }

        await db()
          .update(mediaAssets)
          .set({ rawMediaDeletedAt: new Date() })
          .where(eq(mediaAssets.id, asset.id));

        result.succeeded++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          assetId: asset.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Toggle legal hold on an asset. Held assets are excluded from purge.
   */
  static async setRetentionHold(assetId: string, hold: boolean) {
    const [updated] = await db()
      .update(mediaAssets)
      .set({ retentionHold: hold })
      .where(eq(mediaAssets.id, assetId))
      .returning({ id: mediaAssets.id, retentionHold: mediaAssets.retentionHold });

    return updated ?? null;
  }

  /**
   * Get retention stats for observability.
   */
  static async getStats(): Promise<RetentionStats> {
    const [row] = await db()
      .select({
        expiredPending: sql<number>`count(*) filter (
          where ${mediaAssets.sourceType} = 'upload'
            and ${mediaAssets.rawMediaRetentionUntil} <= now()
            and ${mediaAssets.rawMediaDeletedAt} is null
            and ${mediaAssets.retentionHold} = false
        )`.mapWith(Number),
        purgedTotal: sql<number>`count(*) filter (
          where ${mediaAssets.rawMediaDeletedAt} is not null
        )`.mapWith(Number),
        heldTotal: sql<number>`count(*) filter (
          where ${mediaAssets.retentionHold} = true
        )`.mapWith(Number),
      })
      .from(mediaAssets);

    return {
      expiredPending: row?.expiredPending ?? 0,
      purgedTotal: row?.purgedTotal ?? 0,
      heldTotal: row?.heldTotal ?? 0,
    };
  }
}
