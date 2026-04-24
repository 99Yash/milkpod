/**
 * Replicache poke bus.
 *
 * A "poke" tells a connected client that its next pull will have new data,
 * so it should pull now rather than wait for the next polling tick. Emitted
 * by services after a sync-relevant mutation commits; delivered to the
 * /api/replicache/events SSE stream in `modules/replicache/index.ts` which
 * fans out to the connected client.
 *
 * Contract: every caller of `emitReplicachePokes` / `AssetMemberService.pokeMembers`
 * / `NotificationService.poke` MUST fire the poke AFTER the transaction that
 * produced the syncable write has committed — either outside the transaction
 * callback entirely, or after the `await db().transaction(...)` resolves.
 * A poke emitted from within an uncommitted tx causes the receiving client
 * to pull before the write is visible (the pull runs on a different pool
 * connection and sees the pre-commit snapshot), producing a stale response
 * and a silent miss until the next unrelated trigger.
 *
 * See `modules/replicache/push.ts:214-233` for the canonical post-commit
 * fan-out pattern: the mutation loop returns a summary (affectedAssetIds,
 * userPokeNeeded) that drives the poke calls after the outer transaction
 * resolves — never inside the callback.
 */
import { EventEmitter } from 'node:events';
import type IORedis from 'ioredis';

export interface ReplicachePoke {
  /** User whose client group should re-pull. */
  userId: string;
  /** Asset the poke concerns — clients can skip pull if they aren't viewing it. */
  assetId: string;
}

type PokeListener = (payload: ReplicachePoke) => void;

interface TypedEventBus {
  emit(event: 'poke', payload: ReplicachePoke): boolean;
  on(event: 'poke', listener: PokeListener): this;
  off(event: 'poke', listener: PokeListener): this;
  setMaxListeners(n: number): this;
}

export const replicacheEvents = new EventEmitter() as TypedEventBus;
replicacheEvents.setMaxListeners(200);

const CHANNEL = 'replicache-pokes';

let publisher: IORedis | undefined;
let subscriber: IORedis | undefined;

export async function initReplicachePokeBridge(): Promise<void> {
  const { isQueueEnabled, createRedisConnection } = await import(
    '../queue/connection'
  );

  if (!isQueueEnabled()) return;

  try {
    publisher = createRedisConnection();
    subscriber = createRedisConnection();

    subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const event = JSON.parse(raw) as ReplicachePoke;
        replicacheEvents.emit('poke', event);
      } catch {
        // malformed — drop
      }
    });

    await subscriber.subscribe(CHANNEL);
    console.info('[replicache-events] Redis pub/sub bridge initialized');
  } catch (err) {
    console.warn(
      '[replicache-events] Redis pub/sub bridge disabled:',
      err instanceof Error ? err.message : err,
    );
    publisher = undefined;
    subscriber = undefined;
  }
}

export async function closeReplicachePokeBridge(): Promise<void> {
  if (subscriber) {
    await subscriber.unsubscribe(CHANNEL).catch(() => {});
  }
  publisher = undefined;
  subscriber = undefined;
}

function publish(event: ReplicachePoke): void {
  if (publisher) {
    publisher.publish(CHANNEL, JSON.stringify(event)).catch(() => {
      // Redis publish failed — emit locally so this replica still works.
      // Other replicas will miss this specific poke, but they'll catch up
      // on the client's next regular pull interval.
      replicacheEvents.emit('poke', event);
    });
    return;
  }
  // No Redis bridge — emit locally (single-replica deploys).
  replicacheEvents.emit('poke', event);
}

/**
 * Fan out a poke to one or more users that need to re-pull for this asset.
 *
 * MUST be called AFTER the transaction that produced the syncable write has
 * committed — see the module docblock. Pass `''` for `assetId` when the
 * mutation is user-scoped (e.g. notification mark-read) rather than
 * asset-scoped; the SSE handler filters on `userId` regardless.
 */
export function emitReplicachePokes(userIds: string[], assetId: string): void {
  for (const userId of userIds) {
    publish({ userId, assetId });
  }
}
