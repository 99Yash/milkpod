import { db } from '@milkpod/db';
import {
  assetStatusEnum,
  mediaAssets,
  transcripts,
  transcriptSegments,
  embeddings as embeddingsTable,
} from '@milkpod/db/schemas';
import { and, eq, sql } from 'drizzle-orm';
import type { Segment } from './segments';

type AssetStatus = (typeof assetStatusEnum.enumValues)[number];

export abstract class IngestService {
  static async updateStatus(
    assetId: string,
    status: AssetStatus,
    opts?: { lastError?: string; duration?: number }
  ) {
    await db()
      .update(mediaAssets)
      .set({
        status,
        ...(opts?.lastError != null && { lastError: opts.lastError }),
        ...(opts?.duration != null && { duration: opts.duration }),
      })
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
    await db()
      .update(mediaAssets)
      .set({
        status: 'queued',
        lastError: null,
        attempts: 0,
      })
      .where(eq(mediaAssets.id, assetId));
  }

  static async storeTranscript(
    assetId: string,
    language: string,
    segments: Segment[],
    provider = 'elevenlabs'
  ) {
    return db().transaction(async (tx) => {
      const [transcript] = await tx
        .insert(transcripts)
        .values({
          assetId,
          language,
          provider,
          totalSegments: segments.length,
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

  static async findBySourceId(sourceId: string, userId: string) {
    const [existing] = await db()
      .select()
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.sourceId, sourceId), eq(mediaAssets.userId, userId))
      );
    return existing ?? null;
  }
}
