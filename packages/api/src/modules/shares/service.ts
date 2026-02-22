import { db } from '@milkpod/db';
import {
  shareLinks,
  shareQueries,
  mediaAssets,
  collections,
  collectionItems,
  transcripts,
  transcriptSegments,
} from '@milkpod/db/schemas';
import { and, eq, gte, isNull, count } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { ShareLink, SharedResourceResult } from '../../types';
import type { ShareModel } from './model';

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export abstract class ShareService {
  static async create(userId: string, data: ShareModel.Create): Promise<ShareLink> {
    const token = generateToken();
    const [link] = await db
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

  static async list(userId: string): Promise<ShareLink[]> {
    return db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
      .orderBy(shareLinks.createdAt);
  }

  static async getById(id: string, userId: string): Promise<ShareLink | null> {
    const [link] = await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)));
    return link ?? null;
  }

  static async revoke(id: string, userId: string): Promise<ShareLink | null> {
    const [revoked] = await db
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
    const [link] = await db
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
      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, link.assetId));
      if (!asset) return null;

      // Load transcript + segments for the shared asset
      const [transcript] = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.assetId, link.assetId));

      const segments = transcript
        ? await db
            .select()
            .from(transcriptSegments)
            .where(eq(transcriptSegments.transcriptId, transcript.id))
            .orderBy(transcriptSegments.startTime)
        : [];

      return {
        link,
        resource: { ...asset, transcript: transcript ?? null, segments },
        type: 'asset' as const,
      };
    }

    if (link.collectionId) {
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, link.collectionId));
      if (!collection) return null;

      // Load collection items with asset info
      const items = await db
        .select({
          id: collectionItems.id,
          position: collectionItems.position,
          asset: {
            id: mediaAssets.id,
            title: mediaAssets.title,
            sourceType: mediaAssets.sourceType,
            mediaType: mediaAssets.mediaType,
            status: mediaAssets.status,
            thumbnailUrl: mediaAssets.thumbnailUrl,
            duration: mediaAssets.duration,
          },
        })
        .from(collectionItems)
        .innerJoin(mediaAssets, eq(collectionItems.assetId, mediaAssets.id))
        .where(eq(collectionItems.collectionId, link.collectionId))
        .orderBy(collectionItems.position);

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
    const [result] = await db
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
    await db.insert(shareQueries).values({ shareLinkId, question });
  }
}
