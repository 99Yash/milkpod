import { db } from '@milkpod/db';
import type { AssetId, CollectionId, ShareLinkId, UserId } from '@milkpod/db/helpers';
import {
  shareLinks,
  mediaAssets,
  collections,
  collectionItems,
  transcripts,
  transcriptSegments,
} from '@milkpod/db/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { ShareModel } from './model';

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export abstract class ShareService {
  static async create(userId: UserId, data: ShareModel.Create) {
    const token = generateToken();
    const [link] = await db
      .insert(shareLinks)
      .values({
        token,
        userId,
        assetId: (data.assetId as AssetId) ?? null,
        collectionId: (data.collectionId as CollectionId) ?? null,
        canQuery: data.canQuery ?? false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      })
      .returning();
    return link;
  }

  static async list(userId: UserId) {
    return db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
      .orderBy(shareLinks.createdAt);
  }

  static async getById(id: ShareLinkId, userId: UserId) {
    const [link] = await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)));
    return link ?? null;
  }

  static async revoke(id: ShareLinkId, userId: UserId) {
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

  static async validateToken(token: string) {
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

  static async getSharedResource(token: string) {
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
}
