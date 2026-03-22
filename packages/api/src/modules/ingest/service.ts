import { db } from '@milkpod/db';
import {
  assetStatusEnum,
  visualStatusEnum,
  mediaAssets,
  transcripts,
  transcriptSegments,
  embeddings as embeddingsTable,
  videoContextSegments,
  videoContextEmbeddings,
} from '@milkpod/db/schemas';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { serverEnv } from '@milkpod/env/server';
import type { Segment } from './segments';
import type { VisualSegment } from './video-context';
import { STALE_ASSET_THRESHOLD_MS } from '../../types';

type AssetStatus = (typeof assetStatusEnum.enumValues)[number];
type VisualStatus = (typeof visualStatusEnum.enumValues)[number];

export abstract class IngestService {
  static async updateStatus(
    assetId: string,
    status: AssetStatus,
    opts?: { lastError?: string | null; duration?: number }
  ) {
    const values: {
      status: AssetStatus;
      lastError?: string | null;
      duration?: number;
    } = { status };

    if (opts && 'lastError' in opts) {
      values.lastError = opts.lastError ?? null;
    }

    if (opts?.duration != null) {
      values.duration = opts.duration;
    }

    await db()
      .update(mediaAssets)
      .set(values)
      .where(eq(mediaAssets.id, assetId));
  }

  static async incrementAttempts(assetId: string, lastError: string) {
    await db()
      .update(mediaAssets)
      .set({
        attempts: sql`${mediaAssets.attempts} + 1`,
        lastError,
      })
      .where(eq(mediaAssets.id, assetId));
  }

  static async resetForRetry(assetId: string) {
    await db().transaction(async (tx) => {
      // Delete old transcripts (segments + embeddings cascade via FK)
      await tx
        .delete(transcripts)
        .where(eq(transcripts.assetId, assetId));

      await tx
        .update(mediaAssets)
        .set({
          status: 'queued',
          lastError: null,
          attempts: 0,
        })
        .where(eq(mediaAssets.id, assetId));
    });
  }

  static async storeTranscript(
    assetId: string,
    language: string,
    segments: Segment[],
    provider = 'assemblyai',
    providerMetadata?: Record<string, unknown>
  ) {
    return db().transaction(async (tx) => {
      const [transcript] = await tx
        .insert(transcripts)
        .values({
          assetId,
          language,
          provider,
          totalSegments: segments.length,
          ...(providerMetadata && { providerMetadata }),
        })
        .returning();

      if (!transcript) {
        throw new Error('Failed to insert transcript');
      }

      if (segments.length > 0) {
        await tx.insert(transcriptSegments).values(
          segments.map((seg) => ({
            transcriptId: transcript.id,
            segmentIndex: seg.segmentIndex,
            text: seg.text,
            startTime: seg.startTime,
            endTime: seg.endTime,
            speaker: seg.speaker,
          }))
        );
      }

      const storedSegments = await tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.transcriptId, transcript.id))
        .orderBy(transcriptSegments.segmentIndex);

      return { transcript, segments: storedSegments };
    });
  }

  static async storeEmbeddings(
    items: { segmentId: string; content: string; embedding: number[]; model: string; dimensions: number; }[]
  ) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await db().insert(embeddingsTable).values(batch);
    }
  }

  static async storeVideoContextSegments(
    assetId: string,
    segments: VisualSegment[],
  ) {
    if (segments.length === 0) return [];

    const inserted = await db()
      .insert(videoContextSegments)
      .values(
        segments.map((seg) => ({
          assetId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          summary: seg.summary,
          ocrText: seg.ocrText ?? null,
          entities: seg.entities ?? null,
          confidence: seg.confidence,
          providerMetadata: { model: 'gemini-2.5-flash', provider: 'google' } as Record<string, unknown>,
        }))
      )
      .returning();

    return inserted;
  }

  static async storeVideoContextEmbeddings(
    items: { segmentId: string; content: string; embedding: number[]; model: string; dimensions: number }[]
  ) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await db().insert(videoContextEmbeddings).values(batch);
    }
  }

  /**
   * Set retention deadline on an upload asset based on RAW_MEDIA_RETENTION_DAYS.
   */
  static async setRetentionDeadline(assetId: string) {
    const days = serverEnv().RAW_MEDIA_RETENTION_DAYS;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);

    await db()
      .update(mediaAssets)
      .set({ rawMediaRetentionUntil: deadline })
      .where(eq(mediaAssets.id, assetId));
  }

  static async updateVisualStatus(
    assetId: string,
    visualStatus: VisualStatus,
    opts?: { visualLastError?: string },
  ) {
    await db()
      .update(mediaAssets)
      .set({
        visualStatus,
        ...(opts?.visualLastError != null && { visualLastError: opts.visualLastError }),
      })
      .where(eq(mediaAssets.id, assetId));
  }

  static async incrementVisualAttempts(assetId: string, visualLastError: string) {
    await db()
      .update(mediaAssets)
      .set({
        visualAttempts: sql`${mediaAssets.visualAttempts} + 1`,
        visualLastError,
      })
      .where(eq(mediaAssets.id, assetId));
  }

  /**
   * Touch the asset row so `updatedAt` is refreshed via Drizzle's `$onUpdate`.
   * Called as a heartbeat during long-running pipeline stages to prevent the
   * stale-asset recovery from marking a live pipeline as stuck.
   */
  static async touchHeartbeat(assetId: string) {
    await db()
      .update(mediaAssets)
      .set({ attempts: sql`${mediaAssets.attempts}` }) // no-op value change triggers $onUpdate
      .where(eq(mediaAssets.id, assetId));
  }

  static async findBySourceId(sourceId: string, userId: string) {
    const [existing] = await db()
      .select()
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.sourceId, sourceId), eq(mediaAssets.userId, userId))
      );
    return existing ?? null;
  }

  /**
   * Find all assets stuck in a processing state whose `updatedAt` is older
   * than `STALE_ASSET_THRESHOLD_MS` and mark them as `failed` so they become retryable.
   *
   * Intended to run once at server startup to recover from crashes / deploys.
   */
  static async recoverStaleAssets() {
    const cutoff = new Date(Date.now() - STALE_ASSET_THRESHOLD_MS);

    const stale = await db()
      .update(mediaAssets)
      .set({
        status: 'failed',
        lastError: 'Pipeline interrupted — the server restarted while this asset was processing. Retry to continue.',
      })
      .where(
        and(
          inArray(mediaAssets.status, ['queued', 'fetching', 'transcribing', 'embedding']),
          lt(mediaAssets.updatedAt, cutoff),
        ),
      )
      .returning({ id: mediaAssets.id, userId: mediaAssets.userId });

    if (stale.length > 0) {
      console.info(
        `[ingest] Recovered ${stale.length} stale asset(s): ${stale.map((a) => a.id).join(', ')}`
      );
    }

    return stale;
  }
}
