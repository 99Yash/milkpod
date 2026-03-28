import { EventEmitter } from 'node:events';
import type { AssetStatus } from '../types';
import type IORedis from 'ioredis';

export interface AssetStatusEvent {
  assetId: string;
  userId: string;
  status: AssetStatus;
  message?: string;
  /** 0–100 progress within the current stage */
  progress?: number;
}

type StatusListener = (payload: AssetStatusEvent) => void;

interface TypedEventBus {
  emit(event: 'status', payload: AssetStatusEvent): boolean;
  on(event: 'status', listener: StatusListener): this;
  off(event: 'status', listener: StatusListener): this;
  setMaxListeners(n: number): this;
}

export const assetEvents = new EventEmitter() as TypedEventBus;
assetEvents.setMaxListeners(100);

// ---------------------------------------------------------------------------
// Redis pub/sub bridge
// ---------------------------------------------------------------------------

const CHANNEL = 'asset-status';

let publisher: IORedis | undefined;
let subscriber: IORedis | undefined;

/**
 * Initialize the Redis pub/sub bridge.
 *
 * When active, `emitAssetStatus` / `emitAssetProgress` PUBLISH to Redis
 * instead of emitting locally. The subscriber receives messages from ALL
 * replicas and re-emits them on the local `assetEvents` EventEmitter so
 * the SSE endpoint works unchanged.
 *
 * No-op if Redis is unavailable — falls back to local-only EventEmitter.
 */
export async function initEventBridge(): Promise<void> {
  // Lazy import to avoid requiring ioredis when Redis is not configured
  const { isQueueEnabled, createRedisConnection } = await import('../queue/connection');

  if (!isQueueEnabled()) return;

  try {
    publisher = createRedisConnection();
    subscriber = createRedisConnection();

    subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const event = JSON.parse(raw) as AssetStatusEvent;
        assetEvents.emit('status', event);
      } catch {
        // malformed message — skip
      }
    });

    await subscriber.subscribe(CHANNEL);
    console.info('[events] Redis pub/sub bridge initialized');
  } catch (err) {
    console.warn(
      '[events] Redis pub/sub bridge disabled (Redis unavailable):',
      err instanceof Error ? err.message : err,
    );
    if (subscriber) {
      try { await subscriber.unsubscribe(CHANNEL); } catch { /* ignore */ }
    }
    publisher = undefined;
    subscriber = undefined;
  }
}

/** Tear down the Redis pub/sub bridge. */
export async function closeEventBridge(): Promise<void> {
  if (subscriber) {
    await subscriber.unsubscribe(CHANNEL).catch(() => {});
    // Connection cleanup handled by closeRedis()
  }
  publisher = undefined;
  subscriber = undefined;
}

// ---------------------------------------------------------------------------
// Emit functions
// ---------------------------------------------------------------------------

function publish(event: AssetStatusEvent): void {
  if (publisher) {
    publisher.publish(CHANNEL, JSON.stringify(event)).catch(() => {
      // Redis unavailable — emit locally so this replica still works
      assetEvents.emit('status', event);
    });
    return;
  }
  // No Redis — emit locally
  assetEvents.emit('status', event);
}

export function emitAssetStatus(
  userId: string,
  assetId: string,
  status: AssetStatus,
  message?: string
): void {
  publish({ assetId, userId, status, message });
}

/** Emit sub-stage progress (0–100) without changing the status */
export function emitAssetProgress(
  userId: string,
  assetId: string,
  status: AssetStatus,
  progress: number,
  message?: string
): void {
  publish({
    assetId,
    userId,
    status,
    progress: Math.round(Math.min(100, Math.max(0, progress))),
    message,
  });
}
