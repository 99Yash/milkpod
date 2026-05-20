import { Replicache, type PullerResultV1 } from 'replicache';
import { clientEnv } from '@milkpod/env/client';
import { clientMutators } from '@milkpod/sync';

const env = clientEnv();
const serverUrl = env.NEXT_PUBLIC_SERVER_URL;

// Hung requests freeze the sync pipeline — Replicache's retry backoff only
// kicks in once a request settles. 30s is generous for pull/push payloads.
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Build a Replicache instance scoped to a single authenticated user. The
 * `name` incorporates userId so logging in as a different user uses a
 * separate IndexedDB store (sign-out clears nothing — worst case, a
 * different user's cache stays isolated).
 *
 * Writes go through `rep.mutate.<name>(args)`; they run optimistically
 * against the local IDB first, then push to the server. Pull is triggered
 * explicitly via SSE pokes (no polling interval).
 */
export function createMilkpodReplicache(userId: string) {
  return new Replicache({
    name: `milkpod-${userId}`,
    pullURL: `${serverUrl}/api/replicache/pull`,
    pushURL: `${serverUrl}/api/replicache/push`,
    pullInterval: null,
    mutators: clientMutators,
    puller: async (request) => {
      try {
        const res = await fetch(`${serverUrl}/api/replicache/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const httpRequestInfo = {
          httpStatusCode: res.status,
          errorMessage: res.ok
            ? ''
            : await res.text().catch(() => res.statusText),
        };
        if (!res.ok) return { httpRequestInfo } satisfies PullerResultV1;
        return {
          httpRequestInfo,
          response: await res.json(),
        } satisfies PullerResultV1;
      } catch (err) {
        return {
          httpRequestInfo: {
            httpStatusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        } satisfies PullerResultV1;
      }
    },
    pusher: async (request) => {
      try {
        const res = await fetch(`${serverUrl}/api/replicache/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        return {
          httpRequestInfo: {
            httpStatusCode: res.status,
            errorMessage: res.ok
              ? ''
              : await res.text().catch(() => res.statusText),
          },
        };
      } catch (err) {
        return {
          httpRequestInfo: {
            httpStatusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  });
}

export type MilkpodReplicache = ReturnType<typeof createMilkpodReplicache>;
