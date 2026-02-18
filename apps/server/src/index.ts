import { cors } from '@elysiajs/cors';
import { node } from '@elysiajs/node';
import { app, closeConnections } from '@milkpod/api';
import { serverEnv } from '@milkpod/env/server';
import 'dotenv/config';
import { Elysia } from 'elysia';

const server = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: serverEnv().CORS_ORIGIN,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Thread-Id', 'X-RateLimit-Remaining'],
      credentials: true,
    }),
  )
  .use(app)
  .listen(3001, () => {
    console.log('Server is running on http://localhost:3001');
  });

// Graceful shutdown — drain in-flight requests, then close DB pool
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
