import { db } from '@milkpod/db';
import { replicacheClient, replicacheClientGroup } from '@milkpod/db/schemas';
import { mutatorArgsSchemas, type MutatorName } from '@milkpod/sync';
import { eq } from 'drizzle-orm';
import { AssetMemberService } from '../asset-members/service';
import { emitReplicachePokes } from '../../events/replicache-events';
import { MutatorForbiddenError, serverMutators } from './server-mutators';

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
 * Advance the lastMutationId for a client, upserting the client row if this
 * is the first push we've seen from it. Called whether the mutation succeeds
 * or fails permanently — the point is to keep Replicache from re-queuing
 * mutations forever on an unrecoverable error.
 */
async function advanceLMID(
  clientGroupID: string,
  clientID: string,
  newId: number,
): Promise<void> {
  await db()
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
    });
}

async function getLMID(clientID: string): Promise<number> {
  const [row] = await db()
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

  // Bind clientGroup → user.
  const [group] = await db()
    .select()
    .from(replicacheClientGroup)
    .where(eq(replicacheClientGroup.id, clientGroupID));

  if (group) {
    if (group.userId !== userId) return { forbidden: true };
  } else {
    // Push can race with the first pull — either may create the client group.
    await db()
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
      await advanceLMID(clientGroupID, mutation.clientID, mutation.id);
      console.warn(
        '[replicache:push] unknown mutator',
        mutation.name,
        '— LMID advanced to drop it',
      );
      continue;
    }

    const schema = mutatorArgsSchemas[mutation.name];
    const parsed = schema.safeParse(mutation.args);
    if (!parsed.success) {
      await advanceLMID(clientGroupID, mutation.clientID, mutation.id);
      console.warn(
        '[replicache:push] invalid args for',
        mutation.name,
        parsed.error.issues,
      );
      continue;
    }

    const lastMutationId = await getLMID(mutation.clientID);
    if (mutation.id <= lastMutationId) {
      // Already applied — skip silently (dedup).
      continue;
    }

    try {
      await db().transaction(async (tx) => {
        // Cast through `Function` since TS can't verify the args-per-name
        // mapping across the union — we've already validated args against
        // the matching schema above.
        const runner = (
          serverMutators as Record<
            MutatorName,
            (
              tx: unknown,
              args: unknown,
              ctx: { userId: string },
            ) => Promise<void>
          >
        )[mutation.name as MutatorName];
        await runner(tx, parsed.data, { userId });
        await tx
          .insert(replicacheClient)
          .values({
            id: mutation.clientID,
            clientGroupId: clientGroupID,
            lastMutationId: mutation.id,
            lastModified: new Date(),
          })
          .onConflictDoUpdate({
            target: replicacheClient.id,
            set: { lastMutationId: mutation.id, lastModified: new Date() },
          });
      });
      if (USER_SCOPED_MUTATORS.has(mutation.name)) {
        // User-scoped: the only client that needs to rebase is the caller's
        // other sessions. No assetId to fan out against.
        userPokeNeeded = true;
      } else {
        const assetId = (parsed.data as { assetId: string }).assetId;
        affectedAssetIds.add(assetId);
      }
    } catch (err) {
      if (err instanceof MutatorForbiddenError) {
        console.warn('[replicache:push] ACL rejected', mutation.name, err.message);
      } else {
        console.error(
          '[replicache:push] mutator crashed',
          mutation.name,
          err instanceof Error ? err.message : err,
        );
      }
      // Advance LMID so the client rebases via its next pull instead of
      // re-queuing forever. Next pull will omit the row (server never
      // committed), and Replicache's rebase logic drops the optimistic copy.
      await advanceLMID(clientGroupID, mutation.clientID, mutation.id);
    }
  }

  // Fan out pokes so every member (including the pusher) re-pulls and sees
  // the authoritative server state. Also picks up LMID advancements.
  for (const assetId of affectedAssetIds) {
    await AssetMemberService.pokeMembers(assetId);
  }
  if (userPokeNeeded) {
    // User-scoped mutators only need the caller's other sessions to rebase.
    // Empty assetId is fine — the SSE handler filters on userId, and the
    // client listener triggers a pull regardless of assetId payload.
    try {
      emitReplicachePokes([userId], '');
    } catch (err) {
      console.warn(
        '[replicache:push] user poke failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {};
}
