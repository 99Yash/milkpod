import { db } from '@milkpod/db';
import type { AssetId, CollectionId, ThreadId, UserId } from '@milkpod/db/helpers';
import { qaThreads, qaMessages } from '@milkpod/db/schemas';
import { and, eq } from 'drizzle-orm';
import type { ThreadModel } from './model';

export abstract class ThreadService {
  static async create(userId: UserId, data: ThreadModel.Create) {
    const [thread] = await db
      .insert(qaThreads)
      .values({
        userId,
        title: data.title,
        assetId: data.assetId as AssetId | undefined,
        collectionId: data.collectionId as CollectionId | undefined,
      })
      .returning();
    return thread;
  }

  static async list(userId: UserId) {
    return db
      .select()
      .from(qaThreads)
      .where(eq(qaThreads.userId, userId))
      .orderBy(qaThreads.createdAt);
  }

  static async getById(id: ThreadId, userId: UserId) {
    const [thread] = await db
      .select()
      .from(qaThreads)
      .where(and(eq(qaThreads.id, id), eq(qaThreads.userId, userId)));
    return thread ?? null;
  }

  static async getWithMessages(id: ThreadId, userId: UserId) {
    const thread = await ThreadService.getById(id, userId);
    if (!thread) return null;

    const messages = await db
      .select()
      .from(qaMessages)
      .where(eq(qaMessages.threadId, id))
      .orderBy(qaMessages.createdAt);

    return { ...thread, messages };
  }

  static async update(id: ThreadId, userId: UserId, data: ThreadModel.Update) {
    const [updated] = await db
      .update(qaThreads)
      .set(data)
      .where(and(eq(qaThreads.id, id), eq(qaThreads.userId, userId)))
      .returning();
    return updated ?? null;
  }

  static async remove(id: ThreadId, userId: UserId) {
    const [deleted] = await db
      .delete(qaThreads)
      .where(and(eq(qaThreads.id, id), eq(qaThreads.userId, userId)))
      .returning();
    return deleted ?? null;
  }
}
