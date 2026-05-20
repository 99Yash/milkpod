import { db } from '@milkpod/db';
import { assetMembers } from '@milkpod/db/schemas';
import { eq } from 'drizzle-orm';
import { AssetMemberService } from '../asset-members/service';

/**
 * Authz surface for the Replicache sync engine.
 *
 * This module is the single source of truth for "can this user see / modify
 * this entity via sync?" — pull and push both import from here so they can't
 * drift apart. Coverage matrix for every entity exposed to the client:
 *
 *   Entity         | Read filter (pull)                   | Write check (push)
 *   ---------------|--------------------------------------|--------------------
 *   moment         | assetId ∈ getAccessibleAssetIds      | requireEditor(assetId)
 *   comment        | assetId ∈ getAccessibleAssetIds      | requireEditor(assetId)
 *   notification   | recipientId = userId (inline WHERE)  | recipientId = userId
 *                  |                                      | (inline WHERE — atomic)
 *
 * assets and asset_member rows are NOT currently published via sync (see
 * pull.ts). Their authz is enforced at the REST boundaries (see
 * asset-members/index.ts, assets/service.ts). Adding them to sync would
 * require a new helper here.
 *
 * Note on the notification inline filter: it's a direct column comparison
 * (`recipientId = userId`) that ships in the WHERE clause of the query
 * itself. Wrapping it in a helper would add indirection without removing
 * the call-site repetition — the WHERE is already one line and the rule
 * is obvious. Both pull.ts and the notification mutators use the identical
 * clause, so divergence is structurally prevented.
 */

/**
 * Drizzle handle type that accepts either the pool (`db()`) or a tx passed
 * to `.transaction(async (tx) => …)`. Extracted via Parameters so it tracks
 * the driver version automatically.
 */
type DbHandle =
  | ReturnType<typeof db>
  | Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * Thrown by write-side auth checks (see {@link requireEditor}). The push
 * handler catches this, logs, and advances LMID so Replicache drops the
 * rejected mutation instead of retrying forever.
 */
export class MutatorForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutatorForbiddenError';
  }
}

/**
 * Every asset the user can see — i.e. every asset they have an asset_member
 * row on. Accepts an optional Drizzle handle so the caller can run the
 * membership read inside their transaction. pull.ts passes its tx so the
 * membership read is scheduled on the same connection as the subsequent
 * moments/comments reads, narrowing the window in which a concurrent
 * revocation could cause an inconsistent view within a single pull. (Race
 * is self-healing regardless — next pull emits the correct `del` ops — but
 * tighter timing means fewer stale responses to begin with.)
 */
export async function getAccessibleAssetIds(
  userId: string,
  dbHandle: DbHandle = db(),
): Promise<string[]> {
  const rows = await dbHandle
    .select({ assetId: assetMembers.assetId })
    .from(assetMembers)
    .where(eq(assetMembers.userId, userId));
  return rows.map((r) => r.assetId);
}

/**
 * Assert that `userId` has editor-or-owner permission on `assetId`. Throws
 * {@link MutatorForbiddenError} otherwise. Delegates to
 * `AssetMemberService.isEditor` so the role-threshold rule lives in exactly
 * one place (the membership service).
 *
 * The query runs on the pool connection, not the current push tx. That's
 * safe today because no mutator modifies membership — a user's editor
 * status during a push cannot change due to earlier mutations in the same
 * batch. If a future mutator adds/removes memberships, this will need to
 * accept the tx and query inside it.
 */
export async function requireEditor(
  assetId: string,
  userId: string,
): Promise<void> {
  const allowed = await AssetMemberService.isEditor(assetId, userId);
  if (!allowed) {
    throw new MutatorForbiddenError(
      `User ${userId} is not an editor of asset ${assetId}`,
    );
  }
}
