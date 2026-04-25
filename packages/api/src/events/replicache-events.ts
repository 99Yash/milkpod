/**
 * Replicache poke bus.
 *
 * A "poke" tells a connected client that its next pull will have new data,
 * so it should pull now rather than wait for the next polling tick. Emitted
 * by services after a sync-relevant mutation commits; delivered to the
 * /api/replicache/events SSE stream in `modules/replicache/index.ts` which
 * fans out to the connected client.
 *
 * Channel scoping: pokes are published on per-user Redis channels
 * (`replicache-pokes:u:<userId>`), never on a global broadcast channel. A
 * replica only subscribes to the channels for users whose SSE connections
 * it is currently holding (refcounted via {@link subscribeUserPokes}). So a
 * push on replica A for user U only reaches the replica actually serving
 * U's SSE stream — no fan-in across the whole fleet. The client, in turn,
 * only sees pokes addressed to its own userId, which by construction are
 * only emitted for assets the user has access to (see
 * `emitReplicachePokes` callers and `AssetMemberService.pokeMembers` — the
 * recipient list is computed from membership, so a user never receives a
 * poke for an asset they can't see).
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
  /** Asset the poke concerns — empty string for user-scoped pokes (e.g. notification read). */
  assetId: string;
}

type PokeListener = (payload: ReplicachePoke) => void;

/** Per-user event name on the local bus. */
const eventFor = (userId: string) => `poke:${userId}`;

/** Per-user Redis channel. No global broadcast channel exists. */
const CHANNEL_PREFIX = 'replicache-pokes:u:';
const channelFor = (userId: string) => `${CHANNEL_PREFIX}${userId}`;
const userIdFromChannel = (channel: string): string | null =>
  channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : null;

/**
 * Internal fan-out bus for this replica. A Redis message arrives, we
 * decode the channel back to a userId, and emit on `poke:<userId>` — the
 * SSE handler for that user is the only listener.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0); // many users × many connections; event names are already user-scoped

let publisher: IORedis | undefined;
let subscriber: IORedis | undefined;

/**
 * Refcount of active per-user SSE listeners on this replica. Drives
 * dynamic Redis `SUBSCRIBE` / `UNSUBSCRIBE` so each replica only
 * receives pokes for users it is currently serving.
 */
const userRefCounts = new Map<string, number>();

export async function initReplicachePokeBridge(): Promise<void> {
  const { isQueueEnabled, createRedisConnection } = await import(
    '../queue/connection'
  );

  if (!isQueueEnabled()) return;

  try {
    publisher = createRedisConnection();
    subscriber = createRedisConnection();

    subscriber.on('message', (channel: string, raw: string) => {
      const userId = userIdFromChannel(channel);
      if (userId === null) return;
      try {
        const event = JSON.parse(raw) as ReplicachePoke;
        // Only re-emit if payload.userId matches the channel's userId. Guards
        // against a misaddressed publish — the channel is the authority here.
        if (event.userId !== userId) return;
        emitter.emit(eventFor(userId), event);
      } catch {
        // malformed — drop
      }
    });

    console.info('[replicache-events] Redis pub/sub bridge initialized');
  } catch (err) {
    console.warn(
      '[replicache-events] Redis pub/sub bridge disabled:',
      err instanceof Error ? err.message : String(err),
    );
    publisher = undefined;
    subscriber = undefined;
  }
}

export async function closeReplicachePokeBridge(): Promise<void> {
  if (subscriber) {
    const channels = Array.from(userRefCounts.keys()).map(channelFor);
    if (channels.length > 0) {
      await subscriber.unsubscribe(...channels).catch(() => {});
    }
  }
  userRefCounts.clear();
  publisher = undefined;
  subscriber = undefined;
}

function publish(event: ReplicachePoke): void {
  const channel = channelFor(event.userId);
  if (publisher) {
    publisher.publish(channel, JSON.stringify(event)).catch(() => {
      // Redis publish failed — emit locally so this replica still works.
      // Other replicas will miss this specific poke, but they'll catch up
      // on the client's next regular pull interval.
      emitter.emit(eventFor(event.userId), event);
    });
    return;
  }
  // No Redis bridge — emit locally (single-replica deploys).
  emitter.emit(eventFor(event.userId), event);
}

/**
 * Fan out a poke to one or more users that need to re-pull for this asset.
 *
 * MUST be called AFTER the transaction that produced the syncable write has
 * committed — see the module docblock. Pass `''` for `assetId` when the
 * mutation is user-scoped (e.g. notification mark-read) rather than
 * asset-scoped. The SSE handler receives only pokes addressed to its user.
 */
export function emitReplicachePokes(userIds: string[], assetId: string): void {
  for (const userId of userIds) {
    publish({ userId, assetId });
  }
}

/**
 * Register an SSE-style listener for pokes addressed to `userId`. Returns
 * an unsubscribe function that MUST be called when the SSE connection
 * closes, so this replica can drop its Redis subscription once no
 * connections remain for the user.
 *
 * Uses a per-user refcount so multiple concurrent connections from the
 * same user (e.g. multiple tabs) share a single Redis subscription.
 */
export function subscribeUserPokes(
  userId: string,
  listener: PokeListener,
): () => void {
  const eventName = eventFor(userId);
  emitter.on(eventName, listener);

  const prev = userRefCounts.get(userId) ?? 0;
  userRefCounts.set(userId, prev + 1);

  if (prev === 0 && subscriber) {
    subscriber.subscribe(channelFor(userId)).catch((err) => {
      console.warn(
        '[replicache-events] subscribe failed for user',
        userId,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  return () => {
    emitter.off(eventName, listener);
    const remaining = (userRefCounts.get(userId) ?? 1) - 1;
    if (remaining <= 0) {
      userRefCounts.delete(userId);
      if (subscriber) {
        subscriber.unsubscribe(channelFor(userId)).catch(() => {});
      }
    } else {
      userRefCounts.set(userId, remaining);
    }
  };
}
