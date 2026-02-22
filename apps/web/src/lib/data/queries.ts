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

type MessageRole = MilkpodMessage['role'];

function isMessageRole(s: string): s is MessageRole {
  return s === 'system' || s === 'user' || s === 'assistant';
}

type PartRow = typeof qaMessageParts.$inferSelect;
type Part = MilkpodMessage['parts'][number];

function deserializePart(row: PartRow): Part {
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
  if (row.type.startsWith('tool-')) {
    return {
      type: row.type,
      toolCallId: row.toolCallId ?? '',
      state: row.toolState ?? 'output-available',
      input: row.toolInput,
      output: row.toolOutput,
    } as Part;
  }
  return { type: 'text', text: '' } as Part;
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

  const messages = messageRows.flatMap<MilkpodMessage>((row) => {
    if (!isMessageRole(row.role)) return [];
    return {
      id: row.id,
      role: row.role,
      parts: (partsByMessage.get(row.id) ?? []).map(deserializePart),
    };
  });

  return { threadId: thread.id, messages };
}
