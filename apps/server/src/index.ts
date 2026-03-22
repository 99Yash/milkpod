import { cors } from '@elysiajs/cors';
import { node } from '@elysiajs/node';
import { app, closeConnections, warmPool, IngestService } from '@milkpod/api';
import { serverEnv } from '@milkpod/env/server';
import { Elysia } from 'elysia';

// Pre-warm the DB pool before accepting requests so the first
// requests don't pay the TCP + SSL handshake cost to Neon.
await warmPool();

// Recover assets that were stuck in a processing state when the
// previous server instance went down (crash, deploy, OOM, etc.).
try {
  await IngestService.recoverStaleAssets();
} catch (err) {
  console.error('[startup] Failed to recover stale assets:', err instanceof Error ? err.message : err);
}

const server = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: serverEnv().CORS_ORIGIN,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Thread-Id', 'X-Plan', 'X-Words-Remaining', 'X-Is-Admin', 'X-RateLimit-Remaining'],
      credentials: true,
    }),
  )
  .use(app)
  .listen(
    {
      port: 3001,
      maxRequestBodySize: 1024 * 1024 * 2150 /* ~2.1 GB — slightly above 2 GB app upload limit */,
    },
    () => {
      console.log('Server is running on http://localhost:3001');
    },
  );

// Graceful shutdown: drain in-flight requests, then close DB pool
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Stop accepting new connections, let in-flight requests finish
  await server.stop();
  console.log('Server stopped accepting connections');

  try {
    await closeConnections();
    console.log('Database pool closed');
  } catch (err) {
    console.error('Error closing database pool:', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
