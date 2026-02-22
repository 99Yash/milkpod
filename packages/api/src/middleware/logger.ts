import { Elysia } from 'elysia';

const timings = new WeakMap<Request, number>();

function normalizeStatus(status: number | string | undefined): number {
  if (typeof status === 'number') return status;
  if (typeof status === 'string') {
    const num = parseInt(status, 10);
    if (!isNaN(num)) return num;
  }
  return 200;
}

export const requestLogger = new Elysia({ name: 'request-logger' })
  .onRequest(({ request }) => {
    timings.set(request, performance.now());
  })
  .onAfterResponse((ctx) => {
    const start = timings.get(ctx.request);
    const durationMs = start != null ? Math.round(performance.now() - start) : -1;
    timings.delete(ctx.request);

    const url = new URL(ctx.request.url);
    const path = url.pathname;

    // Skip health/readiness check noise
    if (path === '/health' || path === '/ready') return;

    const method = ctx.request.method;
    const status = normalizeStatus(ctx.set.status);
    const userId =
      'user' in ctx && ctx.user && typeof ctx.user === 'object' && 'id' in ctx.user
        ? (ctx.user as { id: string }).id
        : null;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    console.log(
      JSON.stringify({
        level,
        method,
        path,
        status,
        durationMs,
        userId,
        timestamp: new Date().toISOString(),
      })
    );
  });
