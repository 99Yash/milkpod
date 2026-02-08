import { db } from '@milkpod/db';
import { qaMessages } from '@milkpod/db/schemas';
import { eq, asc } from 'drizzle-orm';
import type { MilkpodMessage } from '@milkpod/ai';

export abstract class ChatService {
  static async saveMessages(threadId: string, messages: MilkpodMessage[]) {
    if (messages.length === 0) return;

    await db
      .insert(qaMessages)
      .values(
        messages.map((m) => ({
          id: m.id,
          threadId,
          role: m.role,
          parts: m.parts,
        }))
      )
      .onConflictDoNothing();
  }

  static async getMessages(threadId: string): Promise<MilkpodMessage[]> {
    const rows = await db
      .select()
      .from(qaMessages)
      .where(eq(qaMessages.threadId, threadId))
      .orderBy(asc(qaMessages.createdAt));

    return rows.map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      parts: row.parts as MilkpodMessage['parts'],
    }));
  }
}
