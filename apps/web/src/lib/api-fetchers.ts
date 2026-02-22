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
// Chat messages
// ---------------------------------------------------------------------------

export async function fetchChatMessages(
  threadId: string
): Promise<{ threadId: string; messages: MilkpodMessage[] } | null> {
  const { data, error } = await api.api.chat({ threadId }).get();
  if (error || !data || !('messages' in data)) return null;
  return data as { threadId: string; messages: MilkpodMessage[] };
}
