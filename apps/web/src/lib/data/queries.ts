import 'server-only';

import { db } from '@milkpod/db';
import {
  mediaAssets,
  collections,
  transcripts,
  transcriptSegments,
  qaThreads,
  qaMessages,
  qaMessageParts,
} from '@milkpod/db/schemas';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Asset, AssetWithTranscript, Collection } from '@milkpod/api/types';
import type { MilkpodMessage } from '@milkpod/ai/types';

export async function getAssets(userId: string): Promise<Asset[]> {
  return db()
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .orderBy(mediaAssets.createdAt);
}

export async function getAssetWithTranscript(
  id: string,
  userId: string
): Promise<AssetWithTranscript | null> {
  // All 3 queries fire in parallel — segments uses a subquery instead of
  // waiting for the transcript row, eliminating a sequential round trip.
  const [assetRows, transcriptRows, segments] = await Promise.all([
    db()
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId))),
    db()
      .select()
      .from(transcripts)
      .where(eq(transcripts.assetId, id)),
    db()
      .select()
      .from(transcriptSegments)
      .where(
        inArray(
          transcriptSegments.transcriptId,
          db().select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.assetId, id)),
        ),
      )
      .orderBy(transcriptSegments.startTime),
  ]);

  const asset = assetRows[0];
  if (!asset) return null;

  const transcript = transcriptRows[0];
  if (!transcript) return { ...asset, transcript: null, segments: [] };

  return { ...asset, transcript, segments };
}

export async function getCollections(userId: string): Promise<Collection[]> {
  return db()
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.createdAt);
}

export async function getThreadsForAsset(
  assetId: string,
  userId: string,
): Promise<{ id: string; title: string | null; createdAt: Date }[]> {
  return db()
    .select({
      id: qaThreads.id,
      title: qaThreads.title,
      createdAt: qaThreads.createdAt,
    })
    .from(qaThreads)
    .where(and(eq(qaThreads.assetId, assetId), eq(qaThreads.userId, userId)))
    .orderBy(desc(qaThreads.createdAt));
}

type MessageRole = MilkpodMessage['role'];

function isMessageRole(s: string): s is MessageRole {
  return s === 'system' || s === 'user' || s === 'assistant';
}

type PartRow = typeof qaMessageParts.$inferSelect;
type Part = MilkpodMessage['parts'][number];

// Cast to Part is required because the Part union contains dynamically generated
// tool discriminators (e.g. `tool-retrieve_segments`) from InferUITools that
// can't be statically matched here. Each branch ensures all required fields are
// present so the shape is correct at runtime.
function deserializePart(row: PartRow): Part {
  if (row.type === 'text' || row.type === 'reasoning') {
    return { type: row.type, text: row.textContent ?? '', state: 'done' } as Part;
  }
  if (row.type === 'step-start') {
    return { type: 'step-start' } as Part;
  }
  if (row.type === 'dynamic-tool') {
    return {
      type: 'dynamic-tool',
      toolName: row.toolName ?? '',
      toolCallId: row.toolCallId ?? '',
      state: (row.toolState ?? 'output-available') as 'output-available',
      input: row.toolInput,
      output: row.toolOutput,
    } as Part;
  }
  if (row.type.startsWith('tool-')) {
    return {
      type: row.type,
      toolName: row.toolName ?? '',
      toolCallId: row.toolCallId ?? '',
      state: (row.toolState ?? 'output-available') as 'output-available',
      input: row.toolInput,
      output: row.toolOutput,
    } as Part;
  }
  return { type: 'text', text: '', state: 'done' } as Part;
}

export async function getLatestChatThread(
  assetId: string,
  userId: string,
): Promise<{ threadId: string; messages: MilkpodMessage[] } | null> {
  // Subquery for the latest thread — inlined into messages/parts queries so
  // all 3 fire in a single parallel batch (1 round trip instead of 3).
  const latestThreadSq = db()
    .select({ id: qaThreads.id })
    .from(qaThreads)
    .where(and(eq(qaThreads.assetId, assetId), eq(qaThreads.userId, userId)))
    .orderBy(desc(qaThreads.createdAt))
    .limit(1);

  const messagesSq = db()
    .select({ id: qaMessages.id })
    .from(qaMessages)
    .where(inArray(qaMessages.threadId, latestThreadSq));

  const [threadRows, messageRows, partRows] = await Promise.all([
    db()
      .select()
      .from(qaThreads)
      .where(and(eq(qaThreads.assetId, assetId), eq(qaThreads.userId, userId)))
      .orderBy(desc(qaThreads.createdAt))
      .limit(1),
    db()
      .select()
      .from(qaMessages)
      .where(inArray(qaMessages.threadId, latestThreadSq))
      .orderBy(asc(qaMessages.createdAt)),
    db()
      .select()
      .from(qaMessageParts)
      .where(inArray(qaMessageParts.messageId, messagesSq))
      .orderBy(asc(qaMessageParts.sortOrder)),
  ]);

  const thread = threadRows[0];
  if (!thread) return null;
  if (messageRows.length === 0) return { threadId: thread.id, messages: [] };

  const partsByMessage = Map.groupBy(partRows, (r) => r.messageId);

  const messages: MilkpodMessage[] = messageRows
    .filter((row) => isMessageRole(row.role))
    .map((row) => ({
      id: row.id,
      role: row.role as MessageRole,
      parts: (partsByMessage.get(row.id) ?? []).map(deserializePart),
    }));

  return { threadId: thread.id, messages };
}
