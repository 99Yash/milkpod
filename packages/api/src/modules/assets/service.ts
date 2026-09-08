import { db } from '@milkpod/db';
import {
  assetMembers,
  assetStatusEnum,
  embeddings,
  mediaAssets,
  sourceTypeEnum,
  transcripts,
  transcriptSegments,
  user,
} from '@milkpod/db/schemas';
import { and, count, desc, eq, ilike, inArray, lt, ne, or, type SQL } from 'drizzle-orm';
import type {
  Asset,
  AssetRole,
  AssetWithAccess,
  AssetWithTranscript,
} from '../../types';
import { decodeCursor, buildPage, type CursorPage } from '../../utils';
import type { AssetModel } from './model';

const VALID_STATUSES = new Set<string>(assetStatusEnum.enumValues);
const VALID_SOURCE_TYPES = new Set<string>(sourceTypeEnum.enumValues);
const MAX_SPEAKER_NAME_ENTRIES = 50;
const MAX_SPEAKER_ID_LENGTH = 64;
const MAX_SPEAKER_NAME_LENGTH = 80;

export type AssetPage = CursorPage<AssetWithAccess>;

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

  /**
   * Membership-scoped conditions. `assetMembers.userId` is filtered here so
   * the list returns all assets the caller has access to (owner, editor, or
   * viewer). Pass `scope: 'shared'` to restrict to rows where the caller is
   * NOT the owner.
   */
  private static buildSearchConditions(
    userId: string,
    query?: Pick<AssetModel.ListQuery, 'q' | 'status' | 'sourceType' | 'scope'>,
  ): SQL[] {
    const conditions: SQL[] = [eq(assetMembers.userId, userId)];

    if (query?.scope === 'shared') {
      conditions.push(ne(assetMembers.role, 'owner'));
    }

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

  /**
   * Shape the raw joined row into the public AssetWithAccess type.
   * `owner` is always present because `mediaAssets.userId` FKs to `user`.
   */
  private static toAssetWithAccess(row: {
    asset: Asset;
    role: AssetRole;
    ownerId: string;
    ownerName: string;
    ownerImage: string | null;
  }): AssetWithAccess {
    return {
      ...AssetService.sanitize(row.asset),
      role: row.role,
      owner: {
        id: row.ownerId,
        name: row.ownerName,
        image: row.ownerImage,
      },
    };
  }



  static async create(userId: string, data: AssetModel.Create): Promise<Asset> {
    return db().transaction(async (tx) => {
      const [asset] = await tx
        .insert(mediaAssets)
        .values({ userId, ...data })
        .returning();
      if (!asset) throw new Error('Failed to insert media asset');
      // Seed the owner's membership row so the membership-based authz (RSC
      // queries + Replicache pull) sees the owner as a member from day one.
      // The Phase 1 backfill migration only handled pre-existing rows.
      await tx
        .insert(assetMembers)
        .values({ assetId: asset.id, userId, role: 'owner' })
        .onConflictDoNothing();
      return AssetService.sanitize(asset);
    });
  }

  static async list(userId: string): Promise<AssetWithAccess[]> {
    const rows = await db()
      .select({
        asset: mediaAssets,
        role: assetMembers.role,
        ownerId: user.id,
        ownerName: user.name,
        ownerImage: user.image,
      })
      .from(mediaAssets)
      .innerJoin(
        assetMembers,
        and(
          eq(assetMembers.assetId, mediaAssets.id),
          eq(assetMembers.userId, userId),
        ),
      )
      .innerJoin(user, eq(user.id, mediaAssets.userId))
      .orderBy(mediaAssets.createdAt);
    return rows.map(AssetService.toAssetWithAccess);
  }

  static async search(
    userId: string,
    query: AssetModel.ListQuery,
  ): Promise<AssetWithAccess[]> {
    const conditions = AssetService.buildSearchConditions(userId, query);

    const rows = await db()
      .select({
        asset: mediaAssets,
        role: assetMembers.role,
        ownerId: user.id,
        ownerName: user.name,
        ownerImage: user.image,
      })
      .from(mediaAssets)
      .innerJoin(
        assetMembers,
        eq(assetMembers.assetId, mediaAssets.id),
      )
      .innerJoin(user, eq(user.id, mediaAssets.userId))
      .where(and(...conditions))
      .orderBy(mediaAssets.createdAt);
    return rows.map(AssetService.toAssetWithAccess);
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
      .select({
        asset: mediaAssets,
        role: assetMembers.role,
        ownerId: user.id,
        ownerName: user.name,
        ownerImage: user.image,
      })
      .from(mediaAssets)
      .innerJoin(
        assetMembers,
        eq(assetMembers.assetId, mediaAssets.id),
      )
      .innerJoin(user, eq(user.id, mediaAssets.userId))
      .where(and(...conditions))
      .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id))
      .limit(pageSize + 1);

    const shaped = rows.map(AssetService.toAssetWithAccess);
    return buildPage(shaped, pageSize);
  }

  static async getById(id: string, userId: string): Promise<Asset | null> {
    const [asset] = await db()
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)));
    return asset ? AssetService.sanitize(asset) : null;
  }

  /**
   * Membership-based lookup. Returns the asset if the user is in
   * `asset_member` (owner OR editor OR viewer). Use for collaborative
   * operations like moment/comment reads and writes; owner-only operations
   * (retry transcription, delete asset, create public share link) should
   * keep using `getById`.
   */
  static async getByIdAsMember(
    id: string,
    userId: string,
  ): Promise<Asset | null> {
    const [row] = await db()
      .select({ asset: mediaAssets })
      .from(mediaAssets)
      .innerJoin(
        assetMembers,
        and(
          eq(assetMembers.assetId, mediaAssets.id),
          eq(assetMembers.userId, userId),
        ),
      )
      .where(eq(mediaAssets.id, id));
    return row ? AssetService.sanitize(row.asset) : null;
  }

  /**
   * Membership-scoped transcript read. Visible to the owner and every
   * collaborator in `asset_member`. Owners keep access because the
   * backfill (migrations 0031/0035) and `AssetService.create` seed an
   * `asset_member` row with role='owner' for every asset.
   */
  static async getWithTranscript(id: string, userId: string): Promise<AssetWithTranscript | null> {
    const rows = await db()
      .select({
        asset: mediaAssets,
        transcript: transcripts,
        segment: transcriptSegments,
      })
      .from(mediaAssets)
      .innerJoin(
        assetMembers,
        and(
          eq(assetMembers.assetId, mediaAssets.id),
          eq(assetMembers.userId, userId),
        ),
      )
      .leftJoin(transcripts, eq(transcripts.assetId, mediaAssets.id))
      .leftJoin(transcriptSegments, eq(transcriptSegments.transcriptId, transcripts.id))
      .where(eq(mediaAssets.id, id))
      .orderBy(desc(transcripts.createdAt), desc(transcripts.id), transcriptSegments.startTime);

    if (rows.length === 0) return null;

    const asset = AssetService.sanitize(rows[0]!.asset);

    if (!rows[0]!.transcript) {
      return { ...asset, transcript: null, segments: [] };
    }

    // Group segments by transcript, preserving insertion order (createdAt DESC)
    type Row = (typeof rows)[number];
    const transcriptMap = new Map<string, {
      transcript: NonNullable<Row['transcript']>;
      segments: NonNullable<Row['segment']>[];
    }>();

    for (const row of rows) {
      if (!row.transcript) continue;
      if (!transcriptMap.has(row.transcript.id)) {
        transcriptMap.set(row.transcript.id, { transcript: row.transcript, segments: [] });
      }
      if (row.segment) {
        transcriptMap.get(row.transcript.id)!.segments.push(row.segment);
      }
    }

    // Prefer most recent transcript that has segments (Map order = createdAt DESC)
    for (const entry of transcriptMap.values()) {
      if (entry.segments.length > 0) {
        return { ...asset, transcript: entry.transcript, segments: entry.segments };
      }
    }

    // All transcripts empty — use the latest
    const latest = transcriptMap.values().next().value!;
    return { ...asset, transcript: latest.transcript, segments: [] };
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

  /** Count embeddings for an asset's transcript (completeness check for retries). */
  static async countEmbeddingsForAsset(assetId: string): Promise<number> {
    const [row] = await db()
      .select({ value: count() })
      .from(embeddings)
      .innerJoin(transcriptSegments, eq(embeddings.segmentId, transcriptSegments.id))
      .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id))
      .where(eq(transcripts.assetId, assetId));

    return row?.value ?? 0;
  }

  /** Delete all embeddings for an asset's transcript (used to clear partial state on retry). */
  static async deleteEmbeddingsForAsset(assetId: string): Promise<void> {
    const segmentIds = db()
      .select({ id: transcriptSegments.id })
      .from(transcriptSegments)
      .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id))
      .where(eq(transcripts.assetId, assetId));

    await db().delete(embeddings).where(inArray(embeddings.segmentId, segmentIds));
  }

  /**
   * Load stored transcript segments for an asset.
   * Used by the BullMQ worker to resume embedding after a checkpoint.
   */
  static async getStoredSegmentsForEmbedding(assetId: string): Promise<
    { id: string; text: string; startTime: number; endTime: number }[]
  > {
    return db()
      .select({
        id: transcriptSegments.id,
        text: transcriptSegments.text,
        startTime: transcriptSegments.startTime,
        endTime: transcriptSegments.endTime,
      })
      .from(transcriptSegments)
      .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id))
      .where(eq(transcripts.assetId, assetId))
      .orderBy(transcriptSegments.segmentIndex);
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
