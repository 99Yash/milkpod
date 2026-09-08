/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Pre-warms the DB connection pool so the first RSC render doesn't
 * pay the ~2-3 s Neon TCP + SSL handshake cost.
 *
 * Skipped on Cloudflare Workers: Hyperdrive pools server-side and the
 * edge URL is only bridged per-request (see ensureEdgeDb) — warming
 * here would build a Node-style pool plus its heartbeat timer, and
 * workerd forbids timers in global scope (crashed first deploy).
 */
export async function register() {
  // Workers provide navigator.userAgent === 'Cloudflare-Workers' under
  // nodejs_compat; plain Node also has navigator, so match the value.
  const isWorkers =
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers';
  if (process.env.NEXT_RUNTIME === 'nodejs' && !isWorkers) {
    const { warmPool } = await import('@milkpod/db');
    await warmPool();
  }
}
