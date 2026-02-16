import 'server-only';

import { db } from '@milkpod/db';
import { mediaAssets, collections } from '@milkpod/db/schemas';
import { eq } from 'drizzle-orm';
import type { Asset, Collection } from '@milkpod/api/types';

export async function getAssets(userId: string): Promise<Asset[]> {
  return db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .orderBy(mediaAssets.createdAt);
}

export async function getCollections(userId: string): Promise<Collection[]> {
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.createdAt);
}
