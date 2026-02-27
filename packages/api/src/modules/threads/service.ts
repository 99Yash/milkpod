import { db } from '@milkpod/db';
import { qaThreads, qaMessages } from '@milkpod/db/schemas';
import { and, desc, eq } from 'drizzle-orm';
import type { ThreadModel } from './model';

export abstract class ThreadService {
  static async create(userId: string, data: ThreadModel.Create) {
    const [thread] = await db()
      .insert(qaThreads)
      .values({
        userId,
        title: data.title,
        assetId: data.assetId,
        collectionId: data.collectionId,
      })
      .returning();
    return thread;
  }

  static async list(userId: string) {
    return db()
      .select()
      .from(qaThreads)
      .where(eq(qaThreads.userId, userId))
      .orderBy(qaThreads.createdAt);
  }

  static async listForAsset(assetId: string, userId: string) {
    return db()
      .select()
      .from(qaThreads)
      .where(
        and(eq(qaThreads.assetId, assetId), eq(qaThreads.userId, userId))
      )
      .orderBy(desc(qaThreads.createdAt));
  }

  static async getById(id: string, userId: string) {
    const [thread] = await db()
      .select()
      .from(qaThreads)
      .where(and(eq(qaThreads.id, id), eq(qaThreads.userId, userId)));
    return thread ?? null;
  }

  static async getWithMessages(id: string, userId: string) {
    const thread = await ThreadService.getById(id, userId);
    if (!thread) return null;

    const messages = await db()
      .select()
      .from(qaMessages)
      .where(eq(qaMessages.threadId, id))
      .orderBy(qaMessages.createdAt);

    return { ...thread, messages };
  }

  static async update(id: string, userId: string, data: ThreadModel.Update) {
    const [updated] = await db()
      .update(qaThreads)
      .set(data)
      .where(and(eq(qaThreads.id, id), eq(qaThreads.userId, userId)))
      .returning();
    return updated ?? null;
  }

  static async remove(id: string, userId: string) {
    const [deleted] = await db()
      .delete(qaThreads)
      .where(and(eq(qaThreads.id, id), eq(qaThreads.userId, userId)))
      .returning();
    return deleted ?? null;
  }
}
