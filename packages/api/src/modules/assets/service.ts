import { db } from '@milkpod/db';
import {
  assetStatusEnum,
  mediaAssets,
  sourceTypeEnum,
  transcripts,
  transcriptSegments,
} from '@milkpod/db/schemas';
import { and, desc, eq, ilike, inArray, lt, or, type SQL } from 'drizzle-orm';
import type { Asset, AssetWithTranscript } from '../../types';
import type { AssetModel } from './model';

const VALID_STATUSES = new Set<string>(assetStatusEnum.enumValues);
const VALID_SOURCE_TYPES = new Set<string>(sourceTypeEnum.enumValues);

export type AssetPage = {
  items: Asset[];
  nextCursor: string | null;
  hasMore: boolean;
};

export abstract class AssetService {
  private static asRecord(value: unknown): Record<string, unknown> | null {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private static sanitizeSpeakerNames(
    speakerNames: Record<string, string>,
  ): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [speakerId, displayName] of Object.entries(speakerNames)) {
      const id = speakerId.trim();
      const name = displayName.trim();
      if (id.length === 0 || name.length === 0) continue;
      sanitized[id] = name;
    }

    return sanitized;
  }

  /**
   * Null out internal error details so they never reach the client.
   * The raw values remain in the DB for debugging via Drizzle Studio.
   */
  private static sanitize<T extends { lastError?: unknown; visualLastError?: unknown }>(row: T): T {
    return { ...row, lastError: null, visualLastError: null };
  }

  private static buildSearchConditions(
    userId: string,
    query?: Pick<AssetModel.ListQuery, 'q' | 'status' | 'sourceType'>,
  ): SQL[] {
    const conditions: SQL[] = [eq(mediaAssets.userId, userId)];
    if (!query) return conditions;

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
        )!,
      );
    }

    return conditions;
  }

  private static encodeCursor(row: Pick<Asset, 'id' | 'createdAt'>): string {
    const payload = JSON.stringify({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
    });
    return Buffer.from(payload).toString('base64url');
  }

  private static decodeCursor(
    cursor: string | undefined,
  ): { id: string; createdAt: Date } | null {
    if (!cursor) return null;

    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as { id?: string; createdAt?: string };
      if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
        return null;
      }

      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        return null;
      }

      return { id: parsed.id, createdAt };
    } catch {
      return null;
    }
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
    const conditions = AssetService.buildSearchConditions(userId, query);

    const rows = await db()
      .select()
      .from(mediaAssets)
      .where(and(...conditions))
      .orderBy(mediaAssets.createdAt);
    return rows.map(AssetService.sanitize);
  }

  static async listPage(
    userId: string,
    query: AssetModel.ListQuery,
    limit = 24,
  ): Promise<AssetPage> {
    const pageSize = Math.max(1, Math.min(limit, 100));
    const conditions = AssetService.buildSearchConditions(userId, query);
    const cursor = AssetService.decodeCursor(query.cursor);

    if (cursor) {
      conditions.push(
        or(
          lt(mediaAssets.createdAt, cursor.createdAt),
          and(
            eq(mediaAssets.createdAt, cursor.createdAt),
            lt(mediaAssets.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await db()
      .select()
      .from(mediaAssets)
      .where(and(...conditions))
      .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const pageRows = (hasMore ? rows.slice(0, pageSize) : rows).map(
      AssetService.sanitize,
    );
    const nextCursor = hasMore
      ? AssetService.encodeCursor(pageRows[pageRows.length - 1]!)
      : null;

    return {
      items: pageRows,
      nextCursor,
      hasMore,
    };
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

  static async updateSpeakerNames(
    assetId: string,
    speakerNames: Record<string, string>,
  ): Promise<Record<string, string> | null> {
    const [transcript] = await db()
      .select({ id: transcripts.id, providerMetadata: transcripts.providerMetadata })
      .from(transcripts)
      .where(eq(transcripts.assetId, assetId))
      .orderBy(desc(transcripts.createdAt))
      .limit(1);

    if (!transcript) return null;

    const sanitizedNames = AssetService.sanitizeSpeakerNames(speakerNames);
    const existingMetadata =
      AssetService.asRecord(transcript.providerMetadata) ?? {};

    await db()
      .update(transcripts)
      .set({
        providerMetadata: {
          ...existingMetadata,
          speakerNames: sanitizedNames,
        },
      })
      .where(eq(transcripts.id, transcript.id));

    return sanitizedNames;
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
