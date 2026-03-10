import { api } from './api';
import type {
  Asset,
  AssetWithTranscript,
  Collection,
  CollectionWithItems,
  ShareLink,
} from '@milkpod/api/types';
import type { MilkpodMessage } from '@milkpod/ai/types';
import {
  deletePersistedChatMessages,
  readPersistedChatMessages,
  writePersistedChatMessages,
} from './local-first/chat-cache';

type ChatMessagesResult = { threadId: string; messages: MilkpodMessage[] };

const chatMessagesCache = new Map<string, ChatMessagesResult>();
const chatMessagesInflight = new Map<string, Promise<ChatMessagesResult | null>>();
const persistedChatMessagesInflight = new Map<
  string,
  Promise<ChatMessagesResult | undefined>
>();
const persistChatMessagesTimers = new Map<
  string,
  ReturnType<typeof globalThis.setTimeout>
>();

async function loadPersistedChatMessages(
  threadId: string,
): Promise<ChatMessagesResult | undefined> {
  const existing = persistedChatMessagesInflight.get(threadId);
  if (existing) return existing;

  const request = readPersistedChatMessages(threadId)
    .then((persisted) => {
      if (persisted) {
        chatMessagesCache.set(threadId, persisted);
      }
      return persisted;
    })
    .finally(() => {
      persistedChatMessagesInflight.delete(threadId);
    });

  persistedChatMessagesInflight.set(threadId, request);
  return request;
}

function schedulePersistChatMessages(threadId: string, messages: MilkpodMessage[]): void {
  const existing = persistChatMessagesTimers.get(threadId);
  if (existing) {
    globalThis.clearTimeout(existing);
  }

  const timer = globalThis.setTimeout(() => {
    persistChatMessagesTimers.delete(threadId);
    void writePersistedChatMessages(threadId, messages);
  }, 250);

  persistChatMessagesTimers.set(threadId, timer);
}

// ---------------------------------------------------------------------------
// Shared resource (returned by /api/shares/validate/:token)
// ---------------------------------------------------------------------------

export type SharedData =
  | {
      type: 'asset';
      resource: AssetWithTranscript;
      canQuery: boolean;
      expiresAt: string | null;
    }
  | {
      type: 'collection';
      resource: CollectionWithItems;
      canQuery: boolean;
      expiresAt: string | null;
    };

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function fetchAssets(
  query?: Record<string, string>
): Promise<Asset[]> {
  const { data, error } = await api.api.assets.get({ query });
  if (error || !data || !Array.isArray(data)) return [];
  return data;
}

// Eden doesn't strip `status()` error branches from the data union, so a cast
// is needed after the error guard. The actual runtime values are correct.

export async function fetchAssetDetail(
  id: string
): Promise<AssetWithTranscript | null> {
  const { data, error } = await api.api.assets({ id }).get();
  if (error || !data) return null;
  return data as AssetWithTranscript;
}

export interface TranscriptSearchResult {
  segmentId: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  rank: number;
  source: 'fts' | 'semantic';
}

export async function searchTranscript(
  assetId: string,
  query: string,
  limit?: number
): Promise<TranscriptSearchResult[]> {
  const { data, error } = await api.api
    .assets({ id: assetId })
    .search.get({
      query: { q: query, ...(limit ? { limit: String(limit) } : {}) },
    });
  if (error || !data || !Array.isArray(data)) return [];
  return data as TranscriptSearchResult[];
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await api.api.collections.get();
  if (error || !data || !Array.isArray(data)) return [];
  return data;
}

export async function fetchCollectionDetail(
  id: string
): Promise<CollectionWithItems | null> {
  const { data, error } = await api.api.collections({ id }).get();
  if (error || !data) return null;
  return data as CollectionWithItems;
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export async function fetchShareLinks(): Promise<ShareLink[]> {
  const { data, error } = await api.api.shares.get();
  if (error || !data || !Array.isArray(data)) return [];
  return data;
}

export async function createShareLink(body: {
  assetId?: string;
  collectionId?: string;
  canQuery: boolean;
  expiresAt?: string;
}): Promise<ShareLink | { error: { status?: number; value?: unknown } }> {
  const { data, error } = await api.api.shares.post(body);
  if (error) return { error };
  if (!data) return { error: { value: undefined } };
  return data as ShareLink;
}

export async function fetchSharedResource(
  token: string
): Promise<SharedData | null> {
  const { data, error } = await api.api.shares.validate({ token }).get();
  if (error || !data || !('type' in data)) return null;
  return data as SharedData;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function fetchThreadsForAsset(
  assetId: string
): Promise<{ id: string; title: string | null; createdAt: string }[]> {
  const { data, error } = await api.api.threads.get({
    query: { assetId },
  });
  if (error || !data || !Array.isArray(data)) return [];
  // Eden types createdAt as Date but JSON serialization sends it as string
  return data as unknown as { id: string; title: string | null; createdAt: string }[];
}

// Eden doesn't strip `status()` error branches from the data union, so a cast
// is needed after the error guard. The actual runtime values are correct.
export async function fetchLatestThreadForAsset(
  assetId: string
): Promise<{ id: string } | null> {
  const threads = await fetchThreadsForAsset(assetId);
  if (threads.length === 0) return null;
  return { id: threads[0]!.id };
}

export async function createThread(body: {
  assetId?: string;
  collectionId?: string;
  title?: string;
}): Promise<{ id: string; title: string | null; createdAt: string } | null> {
  const { data, error } = await api.api.threads.post(body);
  if (error || !data) return null;
  return data as unknown as { id: string; title: string | null; createdAt: string };
}

export async function updateThread(
  threadId: string,
  body: { title?: string }
): Promise<{ id: string; title: string | null; createdAt: string } | null> {
  const { data, error } = await api.api.threads({ id: threadId }).patch(body);
  if (error || !data) return null;
  return data as unknown as { id: string; title: string | null; createdAt: string };
}

export async function regenerateThreadTitle(
  threadId: string
): Promise<{ id: string; title: string | null; createdAt: string } | null> {
  const { data, error } = await api.api
    .threads({ id: threadId })['generate-title']
    .post();
  if (error || !data) return null;
  return data as unknown as { id: string; title: string | null; createdAt: string };
}

export async function deleteThread(
  threadId: string
): Promise<boolean> {
  const { error } = await api.api.threads({ id: threadId }).delete();
  if (error) return false;

  const timer = persistChatMessagesTimers.get(threadId);
  if (timer) {
    globalThis.clearTimeout(timer);
    persistChatMessagesTimers.delete(threadId);
  }

  chatMessagesCache.delete(threadId);
  persistedChatMessagesInflight.delete(threadId);
  chatMessagesInflight.delete(threadId);
  void deletePersistedChatMessages(threadId);

  return true;
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export async function fetchChatMessages(
  threadId: string,
  options?: { preferCache?: boolean }
): Promise<ChatMessagesResult | null> {
  const cached = chatMessagesCache.get(threadId);
  if (options?.preferCache && cached) return cached;

  let persisted: ChatMessagesResult | undefined;
  if (options?.preferCache && !cached) {
    persisted = await loadPersistedChatMessages(threadId);
    if (persisted) {
      void fetchChatMessages(threadId);
      return persisted;
    }
  }

  const inflight = chatMessagesInflight.get(threadId);
  if (inflight) return inflight;

  const request = api.api
    .chat({ threadId })
    .get()
    .then(({ data, error }) => {
      if (error || !data || !('messages' in data)) {
        return chatMessagesCache.get(threadId) ?? persisted ?? null;
      }

      const result = data as ChatMessagesResult;
      chatMessagesCache.set(threadId, result);
      void writePersistedChatMessages(threadId, result.messages);
      return result;
    })
    .finally(() => {
      chatMessagesInflight.delete(threadId);
    });

  chatMessagesInflight.set(threadId, request);
  return request;
}

export function getCachedChatMessages(threadId: string): ChatMessagesResult | undefined {
  return chatMessagesCache.get(threadId);
}

export function primeChatMessagesCache(
  threadId: string,
  messages: MilkpodMessage[]
): void {
  chatMessagesCache.set(threadId, { threadId, messages });
  schedulePersistChatMessages(threadId, messages);
}

export function prefetchChatMessages(threadId: string): void {
  void fetchChatMessages(threadId, { preferCache: true });
}
