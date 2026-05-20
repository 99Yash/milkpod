import type IORedis from 'ioredis';
import { createRedisConnection } from '../../queue/connection';

/** One entry per row in the CVR snapshot. */
export interface CVRRow {
  /** row_version at the time the snapshot was taken. */
  v: number;
  /** assetId needed to reconstruct the Replicache key on a `del` op. */
  a: string;
}

/**
 * Notifications are user-scoped (no assetId in the key) so they carry a
 * narrower per-row record. Kept separate from `CVRRow` so the stored shape
 * stays minimal.
 */
export interface NotificationCVRRow {
  v: number;
}

/**
 * A Client-View Record — what the client had last time they pulled.
 * Diffing the current visible row set against this produces the next patch.
 *
 * `clients` tracks the `lastMutationId` of every client in the group at the
 * time the snapshot was taken. The pull handler emits only the clients whose
 * LMID differs from the prev snapshot so Replicache's protocol invariant
 * holds: if `cookie` doesn't change, `lastMutationIDChanges` must be empty.
 */
export interface CVRSnapshot {
  moments: Record<string, CVRRow>;
  comments: Record<string, CVRRow>;
  /**
   * Notifications are synced per-user regardless of which asset the client is
   * viewing, so entries live at the top level of the snapshot rather than
   * being asset-scoped like moments/comments.
   */
  notifications?: Record<string, NotificationCVRRow>;
  clients?: Record<string, number>;
}

const TTL_SECONDS = 12 * 60 * 60;

export class CVRStore {
  constructor(private readonly redis: IORedis) {}

  private key(clientGroupId: string, version: number): string {
    return `cvr:${clientGroupId}:${version}`;
  }

  async get(
    clientGroupId: string,
    version: number,
  ): Promise<CVRSnapshot | null> {
    const raw = await this.redis.get(this.key(clientGroupId, version));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CVRSnapshot;
    } catch {
      return null;
    }
  }

  async put(
    clientGroupId: string,
    version: number,
    snapshot: CVRSnapshot,
  ): Promise<void> {
    await this.redis.set(
      this.key(clientGroupId, version),
      JSON.stringify(snapshot),
      'EX',
      TTL_SECONDS,
    );
  }
}

let _store: CVRStore | undefined;

export function getCVRStore(): CVRStore {
  if (_store) return _store;
  _store = new CVRStore(createRedisConnection());
  return _store;
}
