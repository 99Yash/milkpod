import { Replicache, TEST_LICENSE_KEY, type PullerResultV1 } from 'replicache';
import { clientEnv } from '@milkpod/env/client';

const serverUrl = clientEnv().NEXT_PUBLIC_SERVER_URL;

/**
 * Build a Replicache instance scoped to a single authenticated user. The
 * `name` incorporates userId so logging in as a different user uses a
 * separate IndexedDB store (sign-out clears nothing — worst case, a
 * different user's cache stays isolated).
 *
 * Phase 2: push is a 501 stub; all writes still go through REST. The Replicache
 * instance is pull-only for now. Pull is triggered explicitly via pokes; no
 * polling interval.
 */
export function createMilkpodReplicache(userId: string) {
  return new Replicache({
    name: `milkpod-${userId}`,
    licenseKey: TEST_LICENSE_KEY,
    pullURL: `${serverUrl}/api/replicache/pull`,
    pushURL: `${serverUrl}/api/replicache/push`,
    pullInterval: null,
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
