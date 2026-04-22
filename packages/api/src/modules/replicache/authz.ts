import { db } from '@milkpod/db';
import { assetMembers } from '@milkpod/db/schemas';
import { eq } from 'drizzle-orm';

/** Every asset the user can see — i.e. every asset they have an asset_member row on. */
export async function getAccessibleAssetIds(userId: string): Promise<string[]> {
  const rows = await db()
    .select({ assetId: assetMembers.assetId })
    .from(assetMembers)
    .where(eq(assetMembers.userId, userId));
  return rows.map((r) => r.assetId);
}
