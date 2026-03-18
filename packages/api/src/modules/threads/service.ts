import { db } from '@milkpod/db';
import { qaThreads, qaMessages } from '@milkpod/db/schemas';
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import type { Thread } from '../../types';
import { decodeCursor, buildPage, type CursorPage } from '../../utils';
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

  static async listPage(
    userId: string,
    query: ThreadModel.ListQuery,
    limit = 50,
  ): Promise<CursorPage<Thread>> {
    const pageSize = Math.max(1, Math.min(limit, 100));
    const conditions: SQL[] = [eq(qaThreads.userId, userId)];

    if (query.assetId) {
      conditions.push(eq(qaThreads.assetId, query.assetId));
    }

    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      conditions.push(
        or(
          lt(qaThreads.createdAt, cursor.createdAt),
          and(
            eq(qaThreads.createdAt, cursor.createdAt),
            lt(qaThreads.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await db()
      .select()
      .from(qaThreads)
      .where(and(...conditions))
      .orderBy(desc(qaThreads.createdAt), desc(qaThreads.id))
      .limit(pageSize + 1);

    return buildPage(rows, pageSize);
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
