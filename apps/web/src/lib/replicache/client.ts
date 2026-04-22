import { Replicache, TEST_LICENSE_KEY, type PullerResultV1 } from 'replicache';
/* TEST_LICENSE_KEY is fine for dev — prod deployments should set
   NEXT_PUBLIC_REPLICACHE_LICENSE_KEY so Replicache logs don't carry the
   'test' marker and so upstream licensing changes don't silently break. */
import { clientEnv } from '@milkpod/env/client';
import { clientMutators } from '@milkpod/sync';

const env = clientEnv();
const serverUrl = env.NEXT_PUBLIC_SERVER_URL;
const licenseKey = env.NEXT_PUBLIC_REPLICACHE_LICENSE_KEY ?? TEST_LICENSE_KEY;

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
    licenseKey,
    pullURL: `${serverUrl}/api/replicache/pull`,
    pushURL: `${serverUrl}/api/replicache/push`,
    pullInterval: null,
    mutators: clientMutators,
    puller: async (request) => {
      const res = await fetch(`${serverUrl}/api/replicache/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request),
      });
      const httpRequestInfo = {
        httpStatusCode: res.status,
        errorMessage: res.ok ? '' : await res.text().catch(() => res.statusText),
      };
      if (!res.ok) return { httpRequestInfo } satisfies PullerResultV1;
      return {
        httpRequestInfo,
        response: await res.json(),
      } satisfies PullerResultV1;
    },
    pusher: async (request) => {
      const res = await fetch(`${serverUrl}/api/replicache/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request),
      });
      return {
        httpRequestInfo: {
          httpStatusCode: res.status,
          errorMessage: res.ok
            ? ''
            : await res.text().catch(() => res.statusText),
        },
      };
    },
  });
}

export type MilkpodReplicache = ReturnType<typeof createMilkpodReplicache>;
