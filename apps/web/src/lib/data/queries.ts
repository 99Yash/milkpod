import 'server-only';

import { cache } from 'react';
import { db } from '@milkpod/db';
import {
  mediaAssets,
  collections,
  collectionItems,
  transcripts,
  transcriptSegments,
  qaThreads,
  qaMessages,
  qaMessageParts,
  assetMoments,
  assetComments,
  momentPresetEnum,
} from '@milkpod/db/schemas';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Asset, AssetWithTranscript, Collection, CollectionWithItems, Comment, Moment } from '@milkpod/api/types';
import type { MilkpodMessage } from '@milkpod/ai/types';

/** Null out internal error details before they reach the client. */
function sanitizeAsset<T extends { lastError?: unknown; visualLastError?: unknown }>(row: T): T {
  return { ...row, lastError: null, visualLastError: null };
}

export async function getAssets(userId: string): Promise<Asset[]> {
  const rows = await db()
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .orderBy(mediaAssets.createdAt);
  return rows.map(sanitizeAsset);
}

export async function getAssetWithTranscript(
  id: string,
  userId: string
): Promise<AssetWithTranscript | null> {
  const [assetRows, transcriptRows] = await Promise.all([
    db()
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId))),
    db()
      .select()
      .from(transcripts)
      .where(eq(transcripts.assetId, id))
      .orderBy(desc(transcripts.createdAt)),
  ]);

  const asset = assetRows[0];
  if (!asset) return null;

  const safe = sanitizeAsset(asset);
  const latestTranscript = transcriptRows[0];
  if (!latestTranscript) return { ...safe, transcript: null, segments: [] };

  const transcriptIds = transcriptRows.map((row) => row.id);
  const allSegments = await db()
    .select()
    .from(transcriptSegments)
    .where(inArray(transcriptSegments.transcriptId, transcriptIds))
    .orderBy(transcriptSegments.transcriptId, transcriptSegments.startTime);

  const segmentsByTranscript = Map.groupBy(
    allSegments,
    (segment) => segment.transcriptId,
  );

  const transcript =
    transcriptRows.find((row) => (segmentsByTranscript.get(row.id)?.length ?? 0) > 0)
    ?? latestTranscript;

  const segments = segmentsByTranscript.get(transcript.id) ?? [];

  return { ...safe, transcript, segments };
}

export async function getCollections(userId: string): Promise<Collection[]> {
  return db()
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.createdAt);
}

export async function getCollectionWithItems(
  id: string,
  userId: string,
): Promise<CollectionWithItems | null> {
  const [collectionRows, items] = await Promise.all([
    db()
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId))),
    db()
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
      .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
      .innerJoin(mediaAssets, eq(collectionItems.assetId, mediaAssets.id))
      .where(
        and(
          eq(collectionItems.collectionId, id),
          eq(collections.userId, userId),
        ),
      )
      .orderBy(collectionItems.position),
  ]);

  const collection = collectionRows[0];
  if (!collection) return null;

  return { ...collection, items };
}

export async function getMoments(
  assetId: string,
  userId: string,
  preset: string = 'default',
): Promise<Moment[]> {
  return db()
    .select()
    .from(assetMoments)
    .where(
      and(
        eq(assetMoments.assetId, assetId),
        eq(assetMoments.userId, userId),
        eq(assetMoments.preset, preset as (typeof momentPresetEnum.enumValues)[number]),
        isNull(assetMoments.dismissedAt),
      ),
    )
    .orderBy(desc(assetMoments.score));
}

export async function getComments(
  assetId: string,
  userId: string,
): Promise<Comment[]> {
  return db()
    .select()
    .from(assetComments)
    .where(
      and(
        eq(assetComments.assetId, assetId),
        eq(assetComments.userId, userId),
        isNull(assetComments.dismissedAt),
      ),
    )
    .orderBy(asc(assetComments.startTime));
}

// Wrapped in React.cache() — the chat layout and chat page both call this
// with the same (assetId, userId) during a single render pass. cache()
// deduplicates so only one DB query fires.
export const getThreadsForAsset = cache(
  async (
    assetId: string,
    userId: string,
  ): Promise<{ id: string; title: string | null; createdAt: Date }[]> => {
    return db()
      .select({
        id: qaThreads.id,
        title: qaThreads.title,
        createdAt: qaThreads.createdAt,
      })
      .from(qaThreads)
      .where(and(eq(qaThreads.assetId, assetId), eq(qaThreads.userId, userId)))
      .orderBy(desc(qaThreads.createdAt));
  },
);

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

/** messageId → { partIndex → translatedText } */
export type TranslationsMap = Record<string, Record<number, string>>;

/**
 * Assemble messages for a single thread from raw DB rows.
 * Shared between getChatThread and getLatestChatThread.
 */
function assembleMessages(
  messageRows: (typeof qaMessages.$inferSelect)[],
  partRows: PartRow[],
): { messages: MilkpodMessage[]; translations: TranslationsMap } {
  if (messageRows.length === 0) return { messages: [], translations: {} };

  const partsByMessage = Map.groupBy(partRows, (r) => r.messageId);

  // Extract saved translations from part rows
  const translations: TranslationsMap = {};
  for (const row of partRows) {
    if (row.translatedTextContent) {
      (translations[row.messageId] ??= {})[row.sortOrder] = row.translatedTextContent;
    }
  }

  const messages = messageRows
    .filter((row) => isMessageRole(row.role))
    .map((row) => ({
      id: row.id,
      role: row.role as MessageRole,
      parts: (partsByMessage.get(row.id) ?? []).map(deserializePart),
    }));

  return { messages, translations };
}

export async function getChatThread(
  threadId: string,
  userId: string,
): Promise<{ threadId: string; messages: MilkpodMessage[]; translations: TranslationsMap } | null> {
  const messagesSq = db()
    .select({ id: qaMessages.id })
    .from(qaMessages)
    .where(eq(qaMessages.threadId, threadId));

  const [threadRows, messageRows, partRows] = await Promise.all([
    db()
      .select()
      .from(qaThreads)
      .where(and(eq(qaThreads.id, threadId), eq(qaThreads.userId, userId))),
    db()
      .select()
      .from(qaMessages)
      .where(eq(qaMessages.threadId, threadId))
      .orderBy(asc(qaMessages.createdAt)),
    db()
      .select()
      .from(qaMessageParts)
      .where(inArray(qaMessageParts.messageId, messagesSq))
      .orderBy(asc(qaMessageParts.sortOrder)),
  ]);

  const thread = threadRows[0];
  if (!thread) return null;

  const { messages, translations } = assembleMessages(messageRows, partRows);
  return { threadId: thread.id, messages, translations };
}

export async function getLatestChatThread(
  assetId: string,
  userId: string,
): Promise<{ threadId: string; messages: MilkpodMessage[]; translations: TranslationsMap } | null> {
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

  const { messages, translations } = assembleMessages(messageRows, partRows);
  return { threadId: thread.id, messages, translations };
}
