import { db } from '@milkpod/db';
import type { AssetId, CollectionId, CollectionItemId, UserId } from '@milkpod/db/helpers';
import { collections, collectionItems, mediaAssets } from '@milkpod/db/schemas';
import { and, eq } from 'drizzle-orm';
import type { CollectionModel } from './model';

export abstract class CollectionService {
  static async create(userId: UserId, data: CollectionModel.Create) {
    const [collection] = await db
      .insert(collections)
      .values({ userId, ...data })
      .returning();
    return collection;
  }

  static async list(userId: UserId) {
    return db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(collections.createdAt);
  }

  static async getById(id: CollectionId, userId: UserId) {
    const [collection] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)));
    return collection ?? null;
  }

  static async getWithItems(id: CollectionId, userId: UserId) {
    const collection = await CollectionService.getById(id, userId);
    if (!collection) return null;

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
      .where(eq(collectionItems.collectionId, id))
      .orderBy(collectionItems.position);

    return { ...collection, items };
  }

  static async update(id: CollectionId, userId: UserId, data: CollectionModel.Update) {
    const [updated] = await db
      .update(collections)
      .set(data)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();
    return updated ?? null;
  }

  static async remove(id: CollectionId, userId: UserId) {
    const [deleted] = await db
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();
    return deleted ?? null;
  }

  static async addItem(collectionId: CollectionId, data: CollectionModel.AddItem) {
    const [item] = await db
      .insert(collectionItems)
      .values({
        collectionId,
        assetId: data.assetId as AssetId,
        position: data.position,
      })
      .returning();
    return item;
  }

  static async removeItem(collectionId: CollectionId, itemId: CollectionItemId) {
    const [deleted] = await db
      .delete(collectionItems)
      .where(
        and(
          eq(collectionItems.id, itemId),
          eq(collectionItems.collectionId, collectionId)
        )
      )
      .returning();
    return deleted ?? null;
  }
}
