import { db } from '@milkpod/db';
import { createId } from '@milkpod/db/helpers';
import { qaMessages, qaMessageParts } from '@milkpod/db/schemas';
import { eq, asc, inArray } from 'drizzle-orm';
import { isStaticToolUIPart } from 'ai';
import type { MilkpodMessage } from '@milkpod/ai';

type PartRow = typeof qaMessageParts.$inferInsert;
type Part = MilkpodMessage['parts'][number];
type MessageRole = MilkpodMessage['role'];

function isMessageRole(s: string): s is MessageRole {
  return s === 'system' || s === 'user' || s === 'assistant';
}

function serializePart(
  messageId: string,
  part: Part,
  sortOrder: number,
): PartRow {
  const base: PartRow = {
    id: createId('mpt'),
    messageId,
    type: part.type,
    sortOrder,
  };

  if (part.type === 'text' || part.type === 'reasoning') {
    return { ...base, textContent: part.text };
  }

  if (part.type === 'dynamic-tool') {
    return {
      ...base,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      toolState: part.state,
      toolInput: part.input,
      toolOutput: 'output' in part ? part.output : undefined,
    };
  }

  if (isStaticToolUIPart(part)) {
    const toolName = part.type.slice('tool-'.length);
    return {
      ...base,
      toolCallId: part.toolCallId,
      toolName,
      toolState: part.state,
      toolInput: part.input,
      toolOutput: 'output' in part ? part.output : undefined,
    };
  }

  // step-start, data-*, source-*, file, or future part types — store type only
  return base;
}

// Type assertion required: reconstructing AI SDK discriminated union from DB rows.
// The Part type is a complex union from the AI SDK that TypeScript can't verify
// object literals against when the discriminant comes from a DB string column.
function deserializePart(row: typeof qaMessageParts.$inferSelect): Part {
  if (row.type === 'text' || row.type === 'reasoning') {
    return { type: row.type, text: row.textContent ?? '' } as Part;
  }

  if (row.type === 'step-start') {
    return { type: 'step-start' } as Part;
  }

  if (row.type === 'dynamic-tool') {
    return {
      type: 'dynamic-tool',
      toolName: row.toolName ?? '',
      toolCallId: row.toolCallId ?? '',
      state: row.toolState ?? 'output-available',
      input: row.toolInput,
      output: row.toolOutput,
    } as Part;
  }

  // Static tool parts: tool-retrieve_segments, tool-get_transcript_context, etc.
  if (row.type.startsWith('tool-')) {
    return {
      type: row.type,
      toolCallId: row.toolCallId ?? '',
      state: row.toolState ?? 'output-available',
      input: row.toolInput,
      output: row.toolOutput,
    } as Part;
  }

  // Fallback for unknown part types — return as text with empty content
  return { type: 'text', text: '' } as Part;
}

export abstract class ChatService {
  static async saveMessages(threadId: string, messages: MilkpodMessage[]) {
    if (messages.length === 0) return;

    await db().transaction(async (tx) => {
      await tx
        .insert(qaMessages)
        .values(
          messages.map((m) => ({
            id: m.id,
            threadId,
            role: m.role,
          })),
        )
        .onConflictDoNothing();

      const partRows = messages.flatMap((m) =>
        m.parts.map((part, i) => serializePart(m.id, part, i)),
      );

      if (partRows.length > 0) {
        await tx.insert(qaMessageParts).values(partRows).onConflictDoNothing();
      }
    });
  }

  static async getMessages(threadId: string): Promise<MilkpodMessage[]> {
    const messageRows = await db()
      .select()
      .from(qaMessages)
      .where(eq(qaMessages.threadId, threadId))
      .orderBy(asc(qaMessages.createdAt));

    if (messageRows.length === 0) return [];

    const messageIds = messageRows.map((r) => r.id);

    const partRows = await db()
      .select()
      .from(qaMessageParts)
      .where(inArray(qaMessageParts.messageId, messageIds))
      .orderBy(asc(qaMessageParts.sortOrder));

    const partsByMessage = Map.groupBy(partRows, (r) => r.messageId);

    return messageRows.flatMap<MilkpodMessage>((row) => {
      if (!isMessageRole(row.role)) return [];
      return {
        id: row.id,
        role: row.role,
        parts: (partsByMessage.get(row.id) ?? []).map(deserializePart),
      };
    });
  }
}
