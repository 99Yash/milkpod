import { serverEnv } from '@milkpod/env/server';
import IORedis from 'ioredis';

const connections: IORedis[] = [];

/**
 * Whether BullMQ queue processing is enabled (REDIS_URL is set).
 */
export function isQueueEnabled(): boolean {
  return !!serverEnv().REDIS_URL;
}

/**
 * Create a new IORedis connection for BullMQ.
 *
 * BullMQ requires separate connections for Queue (producer) and Worker
 * (consumer), so this is a factory — not a singleton.  Every connection
 * created here is tracked so `closeRedis()` can tear them all down.
 */
export function createRedisConnection(): IORedis {
  const url = serverEnv().REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  const conn = new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  connections.push(conn);
  return conn;
}

/**
 * Create a short-lived Redis connection that is NOT tracked for shutdown.
 * Use for one-off checks (e.g. health probes) where the caller manages the lifecycle.
 */
export function createUntrackedRedisConnection(): IORedis {
  const url = serverEnv().REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/** Gracefully close every Redis connection created via `createRedisConnection`. */
export async function closeRedis(): Promise<void> {
  await Promise.all(
    connections.map((c) => c.quit().catch(() => c.disconnect())),
  );
  connections.length = 0;
}
