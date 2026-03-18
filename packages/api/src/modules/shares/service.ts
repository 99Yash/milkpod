import { db } from '@milkpod/db';
import {
  shareLinks,
  shareQueries,
  mediaAssets,
  collections,
  collectionItems,
  transcripts,
  transcriptSegments,
  user,
} from '@milkpod/db/schemas';
import { and, desc, eq, gte, isNull, count } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { ShareLink, SharedResourceResult } from '../../types';
import type { ShareModel } from './model';

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export abstract class ShareService {
  static async create(userId: string, data: ShareModel.Create): Promise<ShareLink> {
    const token = generateToken();
    const [link] = await db()
      .insert(shareLinks)
      .values({
        token,
        userId,
        assetId: data.assetId ?? null,
        collectionId: data.collectionId ?? null,
        canQuery: data.canQuery ?? false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      })
      .returning();
    if (!link) throw new Error('Failed to insert share link');
    return link;
  }

  static async countActive(userId: string): Promise<number> {
    const [result] = await db()
      .select({ total: count() })
      .from(shareLinks)
      .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)));
    return result?.total ?? 0;
  }

  static async list(userId: string): Promise<ShareLink[]> {
    return db()
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
      .orderBy(shareLinks.createdAt);
  }

  static async getById(id: string, userId: string): Promise<ShareLink | null> {
    const [link] = await db()
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)));
    return link ?? null;
  }

  static async revoke(id: string, userId: string): Promise<ShareLink | null> {
    const [revoked] = await db()
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(shareLinks.id, id),
          eq(shareLinks.userId, userId),
          isNull(shareLinks.revokedAt)
        )
      )
      .returning();
    return revoked ?? null;
  }

  static async validateToken(token: string): Promise<ShareLink | null> {
    const [link] = await db()
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.token, token),
          isNull(shareLinks.revokedAt)
        )
      );

    if (!link) return null;

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      return null;
    }

    return link;
  }

  static async getSharedResource(token: string): Promise<SharedResourceResult | null> {
    const link = await ShareService.validateToken(token);
    if (!link) return null;

    if (link.assetId) {
      // Single JOIN: asset + transcripts + segments (was 3 sequential queries)
      const rows = await db()
        .select({
          asset: mediaAssets,
          transcript: transcripts,
          segment: transcriptSegments,
        })
        .from(mediaAssets)
        .leftJoin(transcripts, eq(transcripts.assetId, mediaAssets.id))
        .leftJoin(transcriptSegments, eq(transcriptSegments.transcriptId, transcripts.id))
        .where(eq(mediaAssets.id, link.assetId))
        .orderBy(desc(transcripts.createdAt), desc(transcripts.id), transcriptSegments.startTime);

      if (rows.length === 0) return null;

      // Strip internal error details before returning to the client
      const { lastError: _, visualLastError: __, ...safeAsset } = rows[0]!.asset;
      const asset = { ...safeAsset, lastError: null, visualLastError: null };

      const transcript = rows[0]!.transcript ?? null;
      const transcriptId = transcript?.id;
      const segments = transcriptId
        ? rows.flatMap((row) =>
            row.segment && row.transcript?.id === transcriptId ? [row.segment] : [],
          )
        : [];

      return {
        link,
        resource: { ...asset, transcript, segments },
        type: 'asset' as const,
      };
    }

    if (link.collectionId) {
      // Single JOIN: collection + items + assets (was 2 sequential queries)
      const rows = await db()
        .select({
          collection: collections,
          item: collectionItems,
          asset: mediaAssets,
        })
        .from(collections)
        .leftJoin(collectionItems, eq(collectionItems.collectionId, collections.id))
        .leftJoin(mediaAssets, eq(mediaAssets.id, collectionItems.assetId))
        .where(eq(collections.id, link.collectionId))
        .orderBy(collectionItems.position);

      if (rows.length === 0) return null;

      const collection = rows[0]!.collection;
      const items = rows.flatMap((row) => {
        if (!row.item || !row.asset) return [];
        return [{
          id: row.item.id,
          position: row.item.position,
          asset: {
            id: row.asset.id,
            title: row.asset.title,
            sourceType: row.asset.sourceType,
            mediaType: row.asset.mediaType,
            status: row.asset.status,
            thumbnailUrl: row.asset.thumbnailUrl,
            duration: row.asset.duration,
          },
        }];
      });

      return {
        link,
        resource: { ...collection, items },
        type: 'collection' as const,
      };
    }

    return null;
  }

  private static RATE_LIMIT = 10;

  static async checkRateLimit(shareLinkId: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [result] = await db()
      .select({ total: count() })
      .from(shareQueries)
      .where(
        and(
          eq(shareQueries.shareLinkId, shareLinkId),
          gte(shareQueries.createdAt, oneHourAgo)
        )
      );
    const used = result?.total ?? 0;
    return {
      allowed: used < ShareService.RATE_LIMIT,
      remaining: Math.max(0, ShareService.RATE_LIMIT - used),
    };
  }

  static async logQuery(shareLinkId: string, question: string) {
    await db().insert(shareQueries).values({ shareLinkId, question });
  }

  static async getOwnerEmail(userId: string): Promise<string | null> {
    const [row] = await db()
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row?.email ?? null;
  }
}
