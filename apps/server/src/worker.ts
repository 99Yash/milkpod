import { app, setEdgeDatabaseUrl } from '@milkpod/api';

// Cloudflare Workers tracer entry (issue #29, Alchemy-managed).
// Reuses the same Elysia `app` as Node, but without `@elysiajs/node` adapter.
// Node-only bootstrapping (pg Pool warmup, BullMQ workers, Redis bridges)
// stays in `src/index.ts` and runs only on Railway/VPS, not on the edge.
//
// Bindings are declared in `alchemy.run.ts`:
// - HYPERDRIVE: Neon Postgres via Hyperdrive (issue #30). Exposes
//   `connectionString`; bridged onto `process.env.DATABASE_URL` below until
//   `db()` reads the binding directly.
// - UPLOAD_BUCKET: R2 bucket for manual uploads (issue #31).
// Queues: CF Queues + Workflows replace BullMQ (issue #32).

interface WorkerEnv {
  HYPERDRIVE?: { connectionString: string };
  UPLOAD_BUCKET?: unknown;
  NODE_ENV?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const hyperdriveConn = env.HYPERDRIVE?.connectionString;
    if (hyperdriveConn) {
      setEdgeDatabaseUrl(hyperdriveConn);
    }
    return app.handle(request);
  },
};

export type WorkerApp = typeof app;
