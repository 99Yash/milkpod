import 'server-only';

import { setEdgeDatabaseUrl } from '@milkpod/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// ---------------------------------------------------------------------------
// Edge DB bootstrap for RSC direct-db reads (issue #40 core).
//
// @milkpod/db connects via process.env.DATABASE_URL on Node, but the web
// Worker has no such env — it gets the HYPERDRIVE binding instead (see
// alchemy.run.ts Website env). Call ensureEdgeDb() first inside every
// server function that touches db().
//
// One-time per isolate (edgeDbReady flag): setEdgeDatabaseUrl() resets the
// pool singleton, so re-calling it per request would leak pools.
// Local `next dev` has no Cloudflare context — getCloudflareContext throws,
// we fall through to DATABASE_URL, and behavior is unchanged.
// ---------------------------------------------------------------------------

let edgeDbReady = false;

export async function ensureEdgeDb(): Promise<void> {
  if (edgeDbReady) return;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const conn = (env as { HYPERDRIVE?: { connectionString?: string } })
      .HYPERDRIVE?.connectionString;
    if (typeof conn === 'string' && conn.length > 0) {
      setEdgeDatabaseUrl(conn);
      edgeDbReady = true;
    }
  } catch {
    // Not on the edge (local dev) — @milkpod/db uses DATABASE_URL.
  }
}
