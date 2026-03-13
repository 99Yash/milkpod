/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Pre-warms the DB connection pool so the first RSC render doesn't
 * pay the ~2-3 s Neon TCP + SSL handshake cost.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmPool } = await import('@milkpod/db');
    await warmPool();
  }
}
