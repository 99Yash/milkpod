import { db } from '@milkpod/db';
import { replicacheClient, replicacheClientGroup } from '@milkpod/db/schemas';
import { mutatorArgsSchemas, type MutatorName } from '@milkpod/sync';
import { eq, sql } from 'drizzle-orm';
import { AssetMemberService } from '../asset-members/service';
import { emitReplicachePokes } from '../../events/replicache-events';
import { MutatorForbiddenError } from './authz';
import { serverMutators } from './server-mutators';

/**
 * Mutators that operate on user-scoped data (no assetId in args). They
 * require a user-channel poke after success rather than asset-member fanout.
 */
const USER_SCOPED_MUTATORS: ReadonlySet<MutatorName> = new Set([
  'notificationMarkRead',
  'notificationMarkAllRead',
]);

export interface PushMutationV1 {
  id: number;
  clientID: string;
  name: string;
  args: unknown;
  timestamp: number;
}

export interface PushRequestBody {
  pushVersion: 1;
  clientGroupID: string;
  mutations: PushMutationV1[];
  profileID?: string;
  schemaVersion?: string;
}

export type PushResponse =
  | Record<string, never>
  | { error: 'ClientStateNotFound' | 'VersionNotSupported' };

function isKnownMutator(name: string): name is MutatorName {
  return name in mutatorArgsSchemas;
}

/**
 * Drizzle's transaction handle type varies across driver versions; the call
 * sites use only shared query-builder methods so a loose alias is fine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

/**
 * Advance the lastMutationId for a client, upserting on first push. The
 * `setWhere` monotonicity guard means a late-arriving lower-id push cannot
 * regress a client's LMID even if two pushes race. Called whether the
 * mutation succeeded or failed permanently — the point is to keep
 * Replicache from re-queuing mutations forever on an unrecoverable error.
 */
async function advanceLMID(
  tx: DbTx,
  clientGroupID: string,
  clientID: string,
  newId: number,
): Promise<void> {
  await tx
    .insert(replicacheClient)
    .values({
      id: clientID,
      clientGroupId: clientGroupID,
      lastMutationId: newId,
      lastModified: new Date(),
    })
    .onConflictDoUpdate({
      target: replicacheClient.id,
      set: { lastMutationId: newId, lastModified: new Date() },
      setWhere: sql`${replicacheClient.lastMutationId} < ${newId}`,
    });
}

async function getLMID(tx: DbTx, clientID: string): Promise<number> {
  const [row] = await tx
    .select({ lmid: replicacheClient.lastMutationId })
    .from(replicacheClient)
    .where(eq(replicacheClient.id, clientID));
  return row?.lmid ?? 0;
}

export async function handlePush(
  userId: string,
  body: PushRequestBody,
): Promise<PushResponse | { forbidden: true }> {
  const { clientGroupID, mutations } = body;

  // Entire push — clientGroup bind, each mutation's writes, and the paired
  // LMID advance — runs inside a single transaction. This keeps the LMID
  // monotonic under concurrent pushes (the SELECT lives in the same tx as
  // the UPSERT) and guarantees that a mid-batch crash leaves the server
  // in a coherent state. Per-mutation failures are isolated via savepoints
  // so one bad mutator can't poison the whole batch.
  const outcome = await db().transaction<
    | { forbidden: true }
    | { forbidden: false; affectedAssetIds: Set<string>; userPokeNeeded: boolean }
  >(async (tx) => {
    const [group] = await tx
      .select()
      .from(replicacheClientGroup)
      .where(eq(replicacheClientGroup.id, clientGroupID));

    if (group) {
      if (group.userId !== userId) return { forbidden: true };
    } else {
      // Push can race with the first pull — either may create the client group.
      await tx
        .insert(replicacheClientGroup)
        .values({
          id: clientGroupID,
          userId,
          cvrVersion: 0,
        })
        .onConflictDoNothing();
    }

    const affectedAssetIds = new Set<string>();
    let userPokeNeeded = false;

    for (const mutation of mutations) {
      if (!isKnownMutator(mutation.name)) {
        await advanceLMID(tx, clientGroupID, mutation.clientID, mutation.id);
        console.warn(
          '[replicache:push] unknown mutator',
          mutation.name,
          '— LMID advanced to drop it',
        );
        continue;
      }

      // Hoist the narrowed name into a local const so the async savepoint
      // callback preserves the `MutatorName` type (property narrowing is
      // widened back to `string` when re-read inside a closure).
      const mutatorName: MutatorName = mutation.name;

      const schema = mutatorArgsSchemas[mutatorName];
      const parsed = schema.safeParse(mutation.args);
      if (!parsed.success) {
        await advanceLMID(tx, clientGroupID, mutation.clientID, mutation.id);
        console.warn(
          '[replicache:push] invalid args for',
          mutatorName,
          parsed.error.issues,
        );
        continue;
      }

      const lastMutationId = await getLMID(tx, mutation.clientID);
      if (mutation.id <= lastMutationId) {
        // Already applied — Replicache retries produce duplicates by design,
        // skip silently.
        continue;
      }

      let applied = false;
      try {
        // Savepoint isolates mutator failure: ACL rejection or a crash
        // inside the mutator rolls back only this mutation's writes, not
        // prior mutations in the same batch. Drizzle's nested transaction
        // issues SAVEPOINT / ROLLBACK TO SAVEPOINT / RELEASE under the hood.
        await tx.transaction(async (subTx: DbTx) => {
          // The args-per-name correlation can't be expressed across the
          // union without a switch. Validated via the matching zod schema
          // above, so the runtime shape matches the target mutator.
          const runner = serverMutators[mutatorName] as (
            tx: DbTx,
            args: unknown,
            ctx: { userId: string },
          ) => Promise<void>;
          await runner(subTx, parsed.data, { userId });
        });
        applied = true;
      } catch (err) {
        if (err instanceof MutatorForbiddenError) {
          console.warn(
            '[replicache:push] ACL rejected',
            mutatorName,
            err.message,
          );
        } else {
          console.error(
            '[replicache:push] mutator crashed',
            mutatorName,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      // Advance LMID whether the mutator succeeded or was rolled back at
      // the savepoint. Next pull omits the rolled-back row (server never
      // committed it) and Replicache's rebase logic drops the optimistic
      // copy — without the LMID bump, the client re-queues forever.
      await advanceLMID(tx, clientGroupID, mutation.clientID, mutation.id);

      if (applied) {
        if (USER_SCOPED_MUTATORS.has(mutatorName)) {
          // User-scoped: the only client that needs to rebase is the
          // caller's other sessions. No assetId to fan out against.
          userPokeNeeded = true;
        } else {
          const assetId = (parsed.data as { assetId: string }).assetId;
          affectedAssetIds.add(assetId);
        }
      }
    }

    return { forbidden: false, affectedAssetIds, userPokeNeeded };
  });

  if (outcome.forbidden) return { forbidden: true };

  // Fan out pokes AFTER the transaction commits so clients pulling in
  // response to a poke don't race with uncommitted writes.
  for (const assetId of outcome.affectedAssetIds) {
    await AssetMemberService.pokeMembers(assetId);
  }
  if (outcome.userPokeNeeded) {
    // User-scoped mutators only need the caller's other sessions to rebase.
    // Empty assetId is fine — the SSE handler filters on userId, and the
    // client listener triggers a pull regardless of assetId payload.
    try {
      emitReplicachePokes([userId], '');
    } catch (err) {
      console.warn(
        '[replicache:push] user poke failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {};
}
