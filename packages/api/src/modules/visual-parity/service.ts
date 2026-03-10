import { db } from '@milkpod/db';
import { mediaAssets } from '@milkpod/db/schemas';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { createUploadDownloadUrl } from '../ingest/upload-storage';
import { extractVideoContext } from '../ingest/video-context';
import { IngestService } from '../ingest/service';

export type RequeueResult = {
  attempted: number;
  queued: number;
  skipped: number;
  errors: Array<{ assetId: string; error: string }>;
};

export type ParityStats = {
  youtube: SourceStats;
  upload: SourceStats;
};

type SourceStats = {
  total: number;
  transcriptReady: number;
  visualCompleted: number;
  visualFailed: number;
  visualPending: number;
  visualNone: number;
};

export abstract class VisualParityService {
  /**
   * Find video assets eligible for visual requeue:
   * - visual_status is 'failed'
   * - OR visual_status is null (never attempted)
   * - asset transcript status is 'ready'
   * - mediaType is 'video'
   * - raw media not yet deleted
   */
  static async findRequeueCandidates(limit = 50) {
    return db()
      .select({
        id: mediaAssets.id,
        sourceUrl: mediaAssets.sourceUrl,
        sourceType: mediaAssets.sourceType,
        userId: mediaAssets.userId,
        duration: mediaAssets.duration,
        visualStatus: mediaAssets.visualStatus,
        visualAttempts: mediaAssets.visualAttempts,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.status, 'ready'),
          eq(mediaAssets.mediaType, 'video'),
          isNull(mediaAssets.rawMediaDeletedAt),
          or(
            eq(mediaAssets.visualStatus, 'failed'),
            // Null = never attempted for older assets
            isNull(mediaAssets.visualStatus),
          ),
        ),
      )
      .limit(limit);
  }

  /**
   * Requeue failed or missing visual extractions.
   * For uploads: refreshes signed URLs before re-triggering.
   * For YouTube: uses sourceUrl directly.
   */
  static async requeue(limit = 50): Promise<RequeueResult> {
    const candidates = await VisualParityService.findRequeueCandidates(limit);

    const result: RequeueResult = {
      attempted: candidates.length,
      queued: 0,
      skipped: 0,
      errors: [],
    };

    for (const asset of candidates) {
      try {
        if (!asset.sourceUrl || !asset.duration || asset.duration <= 0) {
          result.skipped++;
          continue;
        }

        let videoUrl: string;

        if (asset.sourceType === 'upload') {
          // Refresh signed URL with 1-hour TTL for visual extraction
          videoUrl = await createUploadDownloadUrl(asset.sourceUrl, {
            expiresInSeconds: 3600,
          });
        } else {
          // YouTube: use source URL directly
          videoUrl = asset.sourceUrl;
        }

        // Reset visual status and fire extraction
        await IngestService.updateVisualStatus(asset.id, 'pending');

        // Fire-and-forget — extraction updates status internally
        extractVideoContext(
          asset.id,
          videoUrl,
          asset.userId,
          asset.duration,
        ).catch((err) => {
          console.warn(
            `[visual-parity] Requeue extraction failed for ${asset.id}:`,
            err instanceof Error ? err.message : err,
          );
        });

        result.queued++;
      } catch (err) {
        result.errors.push({
          assetId: asset.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Get parity stats comparing visual extraction success rates
   * across YouTube and upload source types.
   */
  static async getParityStats(): Promise<ParityStats> {
    const rows = await db()
      .select({
        sourceType: mediaAssets.sourceType,
        total: sql<number>`count(*)`.mapWith(Number),
        transcriptReady: sql<number>`count(*) filter (
          where ${mediaAssets.status} = 'ready'
        )`.mapWith(Number),
        visualCompleted: sql<number>`count(*) filter (
          where ${mediaAssets.visualStatus} = 'completed'
        )`.mapWith(Number),
        visualFailed: sql<number>`count(*) filter (
          where ${mediaAssets.visualStatus} = 'failed'
        )`.mapWith(Number),
        visualPending: sql<number>`count(*) filter (
          where ${mediaAssets.visualStatus} in ('pending', 'processing')
        )`.mapWith(Number),
        visualNone: sql<number>`count(*) filter (
          where ${mediaAssets.visualStatus} is null
        )`.mapWith(Number),
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.mediaType, 'video'),
          inArray(mediaAssets.sourceType, ['youtube', 'upload']),
        ),
      )
      .groupBy(mediaAssets.sourceType);

    const empty: SourceStats = {
      total: 0,
      transcriptReady: 0,
      visualCompleted: 0,
      visualFailed: 0,
      visualPending: 0,
      visualNone: 0,
    };

    const youtube = rows.find((r) => r.sourceType === 'youtube');
    const upload = rows.find((r) => r.sourceType === 'upload');

    return {
      youtube: youtube ?? { ...empty },
      upload: upload ?? { ...empty },
    };
  }
}
