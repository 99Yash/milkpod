# Architecture

Milkpod is a `pnpm` + Turborepo monorepo split into apps and shared packages.

## Workspaces

- `apps/web` — Next.js App Router frontend (port 3000).
- `apps/server` — Elysia HTTP server (port 3001). Mounts `@milkpod/api`.
- `packages/api` — Elysia routes and Eden treaty types.
- `packages/auth` — Better Auth config and server client.
- `packages/db` — Drizzle schema and database helpers.
- `packages/env` — Validated env loaders (`serverEnv()` / `clientEnv()`).
- `packages/ai` — AI provider config, embeddings, retrieval, tools, streaming.
- `packages/config` — Shared TypeScript configuration.

## Data flow

1. **Frontend → API.** `apps/web` uses an Eden treaty client (`apps/web/src/lib/api.ts`) with `credentials: "include"` so auth cookies travel with every request.
2. **Frontend → Auth.** Client components use `authClient` from `apps/web/src/lib/auth/client.ts`; RSC and server code use `authServer` from `apps/web/src/lib/auth/server.ts`. Both talk to the backend's Better Auth endpoints.
3. **Backend → Auth.** `/api/auth/*` routes are handled by Better Auth from `@milkpod/auth`.
4. **Session.** The backend derives the session via `auth.api.getSession` on every request and attaches it to context. Elysia plugins that need the session use `.derive({ as: 'scoped' }, fn)` so the context propagates to parent modules.

## Path aliases

- `apps/web` uses `~/` for `apps/web/src/*`.
- `apps/server` uses `~/` for `apps/server/src/*`.
- Shared packages are imported as `@milkpod/*`. Avoid deep relative imports across packages.
