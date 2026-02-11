import { db } from '@milkpod/db';
import type { AssetId, UserId } from '@milkpod/db/helpers';
import { mediaAssets, transcripts, transcriptSegments } from '@milkpod/db/schemas';
import { and, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { AssetModel } from './model';

export abstract class AssetService {
  static async create(userId: UserId, data: AssetModel.Create) {
    const [asset] = await db
      .insert(mediaAssets)
      .values({ userId, ...data })
      .returning();
    return asset;
  }

  static async list(userId: UserId) {
    return db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.userId, userId))
      .orderBy(mediaAssets.createdAt);
  }

  static async search(userId: UserId, query: AssetModel.ListQuery) {
    const conditions: SQL[] = [eq(mediaAssets.userId, userId)];

    // Status filter (comma-separated)
    if (query.status) {
      const statuses = query.status.split(',').filter(Boolean) as Array<
        'queued' | 'fetching' | 'transcribing' | 'embedding' | 'ready' | 'failed'
      >;
      if (statuses.length > 0) {
        conditions.push(inArray(mediaAssets.status, statuses));
      }
    }

    // Source type filter (comma-separated)
    if (query.sourceType) {
      const types = query.sourceType.split(',').filter(Boolean) as Array<
        'youtube' | 'podcast' | 'upload' | 'external'
      >;
      if (types.length > 0) {
        conditions.push(inArray(mediaAssets.sourceType, types));
      }
    }

    // Text search on title and channelName
    if (query.q) {
      const pattern = `%${query.q}%`;
      conditions.push(
        or(
          ilike(mediaAssets.title, pattern),
          ilike(mediaAssets.channelName, pattern),
        )!
      );
    }

    return db
      .select()
      .from(mediaAssets)
      .where(and(...conditions))
      .orderBy(mediaAssets.createdAt);
  }

  static async getById(id: AssetId, userId: UserId) {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)));
    return asset ?? null;
  }

  static async getWithTranscript(id: AssetId, userId: UserId) {
    const asset = await AssetService.getById(id, userId);
    if (!asset) return null;

    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.assetId, id));

    if (!transcript) return { ...asset, transcript: null, segments: [] };

    const segments = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, transcript.id))
      .orderBy(transcriptSegments.startTime);

    return { ...asset, transcript, segments };
  }

  static async update(id: AssetId, userId: UserId, data: AssetModel.Update) {
    const [updated] = await db
      .update(mediaAssets)
      .set(data)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)))
      .returning();
    return updated ?? null;
  }

  static async remove(id: AssetId, userId: UserId) {
    const [deleted] = await db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)))
      .returning();
    return deleted ?? null;
  }
}
