import { db } from '@milkpod/db';
import {
  assetStatusEnum,
  mediaAssets,
  sourceTypeEnum,
  transcripts,
  transcriptSegments,
} from '@milkpod/db/schemas';
import { and, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { Asset, AssetWithTranscript } from '../../types';
import type { AssetModel } from './model';

const VALID_STATUSES = new Set<string>(assetStatusEnum.enumValues);
const VALID_SOURCE_TYPES = new Set<string>(sourceTypeEnum.enumValues);

export abstract class AssetService {
  /**
   * Null out internal error details so they never reach the client.
   * The raw values remain in the DB for debugging via Drizzle Studio.
   */
  private static sanitize<T extends { lastError?: unknown; visualLastError?: unknown }>(row: T): T {
    return { ...row, lastError: null, visualLastError: null };
  }

  static async create(userId: string, data: AssetModel.Create): Promise<Asset> {
    const [asset] = await db()
      .insert(mediaAssets)
      .values({ userId, ...data })
      .returning();
    if (!asset) throw new Error('Failed to insert media asset');
    return AssetService.sanitize(asset);
  }

  static async list(userId: string): Promise<Asset[]> {
    const rows = await db()
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.userId, userId))
      .orderBy(mediaAssets.createdAt);
    return rows.map(AssetService.sanitize);
  }

  static async search(userId: string, query: AssetModel.ListQuery): Promise<Asset[]> {
    const conditions: SQL[] = [eq(mediaAssets.userId, userId)];

    // Status filter (comma-separated)
    if (query.status) {
      const statuses = query.status
        .split(',')
        .filter((s): s is (typeof assetStatusEnum.enumValues)[number] =>
          VALID_STATUSES.has(s),
        );
      if (statuses.length > 0) {
        conditions.push(inArray(mediaAssets.status, statuses));
      }
    }

    // Source type filter (comma-separated)
    if (query.sourceType) {
      const types = query.sourceType
        .split(',')
        .filter((s): s is (typeof sourceTypeEnum.enumValues)[number] =>
          VALID_SOURCE_TYPES.has(s),
        );
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

    const rows = await db()
      .select()
      .from(mediaAssets)
      .where(and(...conditions))
      .orderBy(mediaAssets.createdAt);
    return rows.map(AssetService.sanitize);
  }

  static async getById(id: string, userId: string): Promise<Asset | null> {
    const [asset] = await db()
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)));
    return asset ? AssetService.sanitize(asset) : null;
  }

  static async getWithTranscript(id: string, userId: string): Promise<AssetWithTranscript | null> {
    const asset = await AssetService.getById(id, userId);
    if (!asset) return null;

    const [transcript] = await db()
      .select()
      .from(transcripts)
      .where(eq(transcripts.assetId, id));

    if (!transcript) return { ...asset, transcript: null, segments: [] };

    const segments = await db()
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, transcript.id))
      .orderBy(transcriptSegments.startTime);

    return { ...asset, transcript, segments };
  }

  static async getTranscriptLanguage(assetId: string): Promise<string | null> {
    const [row] = await db()
      .select({ language: transcripts.language })
      .from(transcripts)
      .where(eq(transcripts.assetId, assetId))
      .limit(1);
    return row?.language ?? null;
  }

  static async update(id: string, userId: string, data: AssetModel.Update): Promise<Asset | null> {
    const [updated] = await db()
      .update(mediaAssets)
      .set(data)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)))
      .returning();
    return updated ? AssetService.sanitize(updated) : null;
  }

  static async remove(id: string, userId: string): Promise<Asset | null> {
    const [deleted] = await db()
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)))
      .returning();
    return deleted ? AssetService.sanitize(deleted) : null;
  }
}
