import { and, gt, lt, sql } from 'drizzle-orm';
import { db } from '@milkpod/db';
import { realtimeEvents, type RealtimeEventKind } from '@milkpod/db/schemas';
import { getEdgeQueueContext } from '../queue/edge-context';

// ---------------------------------------------------------------------------
// Realtime outbox transport (issue #33).
//
// Why a DB outbox instead of Durable Objects: Alchemy's plain-Worker API in
// this repo (`Cloudflare.Worker("milkpod-server", { main })`) exposes no
// `migrations`/`durableObjects` binding — DO hosting requires restructuring
// the entry into an Effect-native Worker, which is disproportionate for this
// slice. The outbox meets the same contract with the bindings we already
// have (Hyperdrive → Neon): emitters INSERT, edge SSE endpoints poll per
// user. If a DO transport lands later, only this module + the two SSE
// poll loops change — emit call sites and the frontend stay untouched.
//
// Routing rule: outbox writes happen ONLY when an edge invocation context
// is present (Worker fetch/queue handler). On Node (Railway/VPS) the Redis
// pub/sub bridges + local EventEmitter still own fan-out, so no event is
// ever delivered twice.
// ---------------------------------------------------------------------------

/** True when running inside a Cloudflare Worker invocation. */
export function isEdgeRealtimeAvailable(): boolean {
  return getEdgeQueueContext() !== undefined;
}

export interface OutboxAssetStatusPayload {
  assetId: string;
  status: string;
  message?: string;
  progress?: number;
}

export interface OutboxPokePayload {
  assetId: string;
}

export interface OutboxEvent {
  id: number;
  kind: RealtimeEventKind;
  payload: Record<string, unknown>;
}

const POLL_LIMIT = 50;
/** Rows older than this are eligible for pruning. */
const RETENTION_MS = 10 * 60_000;
/** Minimum gap between prune runs per isolate. */
const PRUNE_THROTTLE_MS = 60_000;

let lastPruneAt = 0;

/**
 * Fire-and-forget INSERT. Safe to call from sync `publish()` paths —
 * failures only degrade to "no realtime for this event" (the frontend
 * already polls as a fallback). Always emits locally first via the
 * caller's EventEmitter path, so single-isolate delivery is unaffected.
 */
export function publishOutboxEvent(
  userId: string,
  kind: RealtimeEventKind,
  payload: Record<string, unknown>,
): void {
  if (!isEdgeRealtimeAvailable()) return;
  void db()
    .insert(realtimeEvents)
    .values({ userId, kind, payload })
    .catch((err) => {
      console.warn(
        '[realtime-outbox] publish failed:',
        err instanceof Error ? err.message : String(err),
      );
    });
}

function maybePrune(): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_THROTTLE_MS) return;
  lastPruneAt = now;
  void db()
    .delete(realtimeEvents)
    .where(lt(realtimeEvents.createdAt, new Date(now - RETENTION_MS)))
    .catch((err) => {
      console.warn(
        '[realtime-outbox] prune failed:',
        err instanceof Error ? err.message : String(err),
      );
    });
}

/**
 * Fetch events for `userId` after `afterId` (exclusive), oldest first.
 * Runs an opportunistic throttled prune so the table stays tiny.
 */
export async function fetchOutboxEvents(
  userId: string,
  afterId: number,
  limit: number = POLL_LIMIT,
): Promise<OutboxEvent[]> {
  maybePrune();
  const rows = await db()
    .select({
      id: realtimeEvents.id,
      kind: realtimeEvents.kind,
      payload: realtimeEvents.payload,
    })
    .from(realtimeEvents)
    .where(
      and(
        sql`${realtimeEvents.userId} = ${userId}`,
        gt(realtimeEvents.id, afterId),
      ),
    )
    .orderBy(realtimeEvents.id)
    .limit(limit);
  return rows;
}
