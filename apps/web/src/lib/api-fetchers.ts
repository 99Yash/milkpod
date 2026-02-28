import { api } from './api';
import type {
  Asset,
  AssetWithTranscript,
  Collection,
  CollectionWithItems,
  ShareLink,
} from '@milkpod/api/types';
import type { MilkpodMessage } from '@milkpod/ai/types';

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
}): Promise<ShareLink | null> {
  const { data, error } = await api.api.shares.post(body);
  if (error || !data) return null;
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
  return !error;
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export async function fetchChatMessages(
  threadId: string
): Promise<{ threadId: string; messages: MilkpodMessage[] } | null> {
  const { data, error } = await api.api.chat({ threadId }).get();
  if (error || !data || !('messages' in data)) return null;
  return data as { threadId: string; messages: MilkpodMessage[] };
}
