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
      replicacheEvents.emit('poke', event);
    });
    return;
  }
  replicacheEvents.emit('poke', event);
}

/** Fan out a poke to one or more users that need to re-pull for this asset. */
export function emitReplicachePokes(userIds: string[], assetId: string): void {
  for (const userId of userIds) {
    publish({ userId, assetId });
  }
}
