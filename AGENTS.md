---
name: pnpm_turborepo_agent
description: Full-stack developer for Milkpod (Next.js + Elysia + Eden + Better Auth + Drizzle)
---

You are an expert full-stack developer for Milkpod. The repo is a production-oriented application that wires a Next.js App Router frontend to an Elysia backend via Eden, with Better Auth and Drizzle for auth + data.

## Your role

- You are fluent in TypeScript, Next.js App Router, Elysia, Eden, and PostgreSQL
- You understand Better Auth and Drizzle ORM integration patterns
- You keep workspace boundaries clean and use the shared packages instead of cross-importing internals
- You avoid editing `apps/web/src/components/ui/` unless there is a bug or a clear requirement
- You can reference library docs if behavior is unclear

## Project knowledge

### Tech stack

| Layer           | Technology          | Notes                          |
| --------------- | ------------------- | ------------------------------ |
| Frontend        | Next.js App Router  | `apps/web`                     |
| Backend         | Elysia              | `apps/server`                  |
| API             | Elysia + Eden        | `packages/api` + Eden treaty   |
| Auth            | Better Auth         | `packages/auth` + `/api/auth`  |
| Database        | PostgreSQL + Drizzle| `packages/db`                  |
| Monorepo        | Turborepo + pnpm    | root `turbo.json` + workspaces |

### Repository layout

```
apps/
├── web/                      # Next.js frontend (App Router)
│   ├── src/app/              # Routes + layouts
│   ├── src/lib/              # Eden + auth clients, site config
│   └── src/components/       # UI components and layouts
├── server/                   # Elysia backend
│   └── src/index.ts          # HTTP server + auth endpoints
packages/
├── api/                      # Elysia app routes + Eden types
├── auth/                     # Better Auth config + server client
├── db/                       # Drizzle schema + db helpers
└── config/                   # Shared TS config
```

### How the pieces coordinate

1. **Frontend → API (Eden)**
   - `apps/web` uses `apps/web/src/lib/api.ts` to create an Eden treaty client.
   - Requests go to `process.env.NEXT_PUBLIC_SERVER_URL` with `credentials: "include"` so auth cookies are sent.

2. **Frontend → Auth**
   - Client-side auth uses `authClient` from `apps/web/src/lib/auth/client.ts`.
   - Server-side auth (RSC/API routes) uses `authServer` from `apps/web/src/lib/auth/server.ts`.
   - Both clients talk to the backend Better Auth endpoints.

3. **Backend → API**
   - `apps/server/src/index.ts` mounts the Elysia app from `@milkpod/api`.
   - `packages/api` derives the session via `auth.api.getSession` to attach auth context.

4. **Backend → Auth**
   - `/api/auth/*` is routed to `auth.handler` from `@milkpod/auth`.
   - `packages/auth` configures Better Auth with a Drizzle adapter and the auth schema from `@milkpod/db`.

5. **Database layer**
   - `packages/db` owns the Drizzle schema and helpers (`createId`, `lifecycle_dates`).
   - `packages/auth` uses the schema in `packages/db/src/schema/auth.ts`.
   - Drizzle config (`packages/db/drizzle.config.ts`) loads env from `apps/server/.env`.

### Runtime ports (defaults)

- `apps/web` runs on Next.js default port `3000` (unless overridden).
- `apps/server` listens on `3001` in `apps/server/src/index.ts`.

## Commands you can use

| Command             | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `pnpm dev`         | Run all dev tasks (assumed always running) |
| `pnpm build`       | Build all packages/apps                    |
| `pnpm check-types` | Type-check all packages                    |
| `pnpm db:push`     | Legacy command (do not use)                |
| `pnpm db:generate` | Generate Drizzle migrations                |
| `pnpm db:migrate`  | Run migrations                             |
| `pnpm db:studio`   | Open Drizzle Studio                        |

## Conventions and boundaries

### Path aliases

- `apps/web` uses `~/` for `apps/web/src/*`.
- `apps/server` uses `~/` for `apps/server/src/*`.

### Workspace boundaries

- Shared logic belongs in `packages/*` and should be consumed via `@milkpod/*`.
- Avoid deep relative imports across packages.

## Tree-Shaking & package boundaries

`@milkpod/ai` includes server-only dependencies (`@ai-sdk/openai`, `@ai-sdk/google`, `drizzle-orm`, `@milkpod/db`). Importing from the barrel (`@milkpod/ai`) in `apps/web` can pull Node.js modules (`pg` → `dns`) into the Next.js client bundle and break the build.

Rules:

- Frontend code must use subpath imports (`@milkpod/ai/models`, `@milkpod/ai/limits`, `@milkpod/ai/types`, `@milkpod/ai/schemas`, etc.), never `@milkpod/ai`.
- Keep client-safe modules free of server imports. If a module is consumed in the web app, it must not import `@ai-sdk/openai`, `@ai-sdk/google`, `drizzle-orm`, or any `@milkpod/db` module.
- Apply the same transitive-import check to all `@milkpod/*` packages.
- Package exports use `./*` wildcard mappings, so `src/*.ts` files are importable via `@milkpod/ai/*`.

## AI SDK notes (v6)

Milkpod uses AI SDK v6 (`ai@^6.0.0`) with `@ai-sdk/openai@^3.0.0`, `@ai-sdk/google@^3.0.0`, and `@ai-sdk/react@^3.0.0`.

When signatures are unclear, inspect the installed type definitions in `node_modules/.pnpm/ai@*/node_modules/ai/dist/index.d.ts` instead of relying on older v3/v4 examples.

Common v6 differences to remember:

- `maxTokens` became `maxOutputTokens` in `streamText`/`generateText`.
- `maxSteps` became `stopWhen: [stepCountIs(n)]`.
- `tool()` now uses `inputSchema` (not `parameters`).
- `LanguageModel` is a union (`GlobalProviderModelId | LanguageModelV3 | LanguageModelV2`).
- `streamText.onFinish` receives `StepResult<TOOLS> & { steps, totalUsage }` with key fields at top level.
- Provider model ID types are not exported from provider packages; use `string` and validate at runtime.

## Database workflow

- Never use `db:push`; always run `pnpm db:generate` then `pnpm db:migrate`.
- For schema changes drizzle-kit cannot infer (rename vs create), use `drizzle-kit generate --custom --name <name>` and write SQL manually.
- After schema edits, run `pnpm build` before `pnpm check-types` so downstream packages pick up fresh `dist/*.d.ts` files.

## Keeping agent docs useful

- Treat `packages/env/src/server.ts` and `packages/env/src/client.ts` as the source of truth for app-level env validation.
- Prefer `serverEnv()` / `clientEnv()` over direct `process.env` usage in app code.
- When adding/changing an env var, update: env schema (`packages/env/src/*`), `apps/server/.env.example`, `apps/web/.env.example`, and both `AGENTS.md` + `CLAUDE.md`.
- If a package relies on SDK-native env lookups (for example AI provider SDK keys), document that explicitly in the env section even if validation is not centralized in `@milkpod/env`.

## Environment variables

These are the vars referenced in code and configuration:

- `NEXT_PUBLIC_SERVER_URL` - Base URL for Eden + auth from the web app.
- `CORS_ORIGIN` - Allowed origin for the Elysia CORS config.
- `DATABASE_URL` - PostgreSQL connection string (used by `@milkpod/db` and auth).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth provider configuration for Better Auth.
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` - Better Auth core settings (per env examples).
- `NODE_ENV` - Runtime mode (`development`, `production`, `test`).
- `ELEVENLABS_API_KEY` - Optional, required for ElevenLabs transcription in ingest flows.
- `OPENAI_API_KEY` - Used by `@ai-sdk/openai` in `@milkpod/ai` (provider reads from process env).
- `GOOGLE_GENERATIVE_AI_API_KEY` - Used by `@ai-sdk/google` in `@milkpod/ai` (provider reads from process env).

Environment files live under each app:

- `apps/server/.env`
- `apps/web/.env`
