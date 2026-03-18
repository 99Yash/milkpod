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
import { decodeCursor, buildPage, type CursorPage } from '../../utils';
import type { AssetModel } from './model';

const VALID_STATUSES = new Set<string>(assetStatusEnum.enumValues);
const VALID_SOURCE_TYPES = new Set<string>(sourceTypeEnum.enumValues);
const MAX_SPEAKER_NAME_ENTRIES = 50;
const MAX_SPEAKER_ID_LENGTH = 64;
const MAX_SPEAKER_NAME_LENGTH = 80;

export type AssetPage = CursorPage<Asset>;

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
    let totalEntries = 0;

    for (const [speakerId, displayName] of Object.entries(speakerNames)) {
      const id = speakerId.trim();
      const name = displayName.trim();

      if (
        id.length === 0 ||
        name.length === 0 ||
        id.length > MAX_SPEAKER_ID_LENGTH ||
        name.length > MAX_SPEAKER_NAME_LENGTH
      ) {
        continue;
      }

      const seen = Object.prototype.hasOwnProperty.call(sanitized, id);
      if (!seen && totalEntries >= MAX_SPEAKER_NAME_ENTRIES) {
        break;
      }

      sanitized[id] = name;

      if (!seen) {
        totalEntries += 1;
      }
    }

    return sanitized;
  }

  /**
   * Strip internal-only fields before sending to the client.
   * `lastError` is kept — it is already sanitized by `toSafeErrorMessage()` at write time.
   */
  private static sanitize<T extends { visualLastError?: unknown }>(row: T): T {
    return { ...row, visualLastError: null };
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
    limit = 12,
  ): Promise<AssetPage> {
    const pageSize = Math.max(1, Math.min(limit, 100));
    const conditions = AssetService.buildSearchConditions(userId, query);
    const cursor = decodeCursor(query.cursor);

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

    const page = buildPage(rows, pageSize);
    return {
      ...page,
      items: page.items.map(AssetService.sanitize),
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

    const transcriptRows = await db()
      .select()
      .from(transcripts)
      .where(eq(transcripts.assetId, id))
      .orderBy(desc(transcripts.createdAt));

    const latestTranscript = transcriptRows[0];
    if (!latestTranscript) return { ...asset, transcript: null, segments: [] };

    const transcriptIds = transcriptRows.map((row) => row.id);
    const allSegments = await db()
      .select()
      .from(transcriptSegments)
      .where(inArray(transcriptSegments.transcriptId, transcriptIds))
      .orderBy(transcriptSegments.transcriptId, transcriptSegments.startTime);

    const segmentsByTranscript = Map.groupBy(
      allSegments,
      (segment) => segment.transcriptId,
    );

    const transcript =
      transcriptRows.find((row) => (segmentsByTranscript.get(row.id)?.length ?? 0) > 0)
      ?? latestTranscript;

    const segments = segmentsByTranscript.get(transcript.id) ?? [];

    return { ...asset, transcript, segments };
  }

  static async getTranscriptLanguage(assetId: string): Promise<string | null> {
    const transcriptRows = await db()
      .select({ id: transcripts.id, language: transcripts.language })
      .from(transcripts)
      .where(eq(transcripts.assetId, assetId))
      .orderBy(desc(transcripts.createdAt));

    const latestTranscript = transcriptRows[0];
    if (!latestTranscript) return null;

    const transcriptIds = transcriptRows.map((row) => row.id);

    const transcriptRowsWithSegments = await db()
      .select({ transcriptId: transcriptSegments.transcriptId })
      .from(transcriptSegments)
      .where(inArray(transcriptSegments.transcriptId, transcriptIds))
      .groupBy(transcriptSegments.transcriptId);

    const transcriptIdsWithSegments = new Set(
      transcriptRowsWithSegments.map((row) => row.transcriptId),
    );

    const preferred = transcriptRows.find((row) =>
      transcriptIdsWithSegments.has(row.id),
    );

    return preferred?.language ?? latestTranscript.language ?? null;
  }

  static async hasTranscriptSegments(assetId: string): Promise<boolean> {
    const [row] = await db()
      .select({ id: transcriptSegments.id })
      .from(transcriptSegments)
      .where(
        inArray(
          transcriptSegments.transcriptId,
          db().select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.assetId, assetId)),
        ),
      )
      .limit(1);

    return !!row;
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
