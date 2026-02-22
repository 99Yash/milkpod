import 'server-only';

import { db } from '@milkpod/db';
import {
  mediaAssets,
  collections,
  transcripts,
  transcriptSegments,
} from '@milkpod/db/schemas';
import { and, eq } from 'drizzle-orm';
import type { Asset, AssetWithTranscript, Collection } from '@milkpod/api/types';

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
  const [asset] = await db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)));
  if (!asset) return null;

  const [transcript] = await db()
    .select()
    .from(transcripts)
    .where(eq(transcripts.assetId, id));

  if (!transcript) return { ...asset, transcript: null, segments: [] };

  const segments = await db()
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, transcript.id))
    .orderBy(transcriptSegments.startTime);

  return { ...asset, transcript, segments };
}

export async function getCollections(userId: string): Promise<Collection[]> {
  return db()
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.createdAt);
}
