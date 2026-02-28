# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Milkpod is an AI video transcription and Q&A workspace. Users upload or link videos to get transcripts with timestamps and speaker labels, ask questions with timestamped answers, and generate highlights/summaries.

## Tech Stack

- **Frontend**: Next.js 16 App Router + React 19 (`apps/web`, port 3000)
- **Backend**: Elysia (`apps/server`, port 3001)
- **API Types**: Eden Treaty for type-safe client-server communication
- **Auth**: Better Auth with Drizzle adapter (`packages/auth`)
- **Database**: PostgreSQL + Drizzle ORM (`packages/db`)
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Monorepo**: Turborepo + pnpm

## Commands

```bash
pnpm dev              # Run all dev servers (web + server)
pnpm build            # Build all packages and apps
pnpm check-types      # Type-check entire monorepo
pnpm dev:web          # Run only web app
pnpm dev:server       # Run only backend
pnpm db:push          # Legacy command (do not use)
pnpm db:studio        # Open Drizzle Studio (database GUI)
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
```

## Architecture

### Workspace Structure

- `apps/web` - Next.js frontend
- `apps/server` - Elysia backend (mounts `@milkpod/api`)
- `packages/api` - Elysia routes + Eden types
- `packages/auth` - Better Auth config + server client
- `packages/db` - Drizzle schema + database utilities
- `packages/config` - Shared TypeScript configuration

### Data Flow

1. **Frontend → API**: Web app uses Eden treaty client (`apps/web/src/lib/api.ts`) with `credentials: "include"` for auth cookies
2. **Frontend → Auth**: Client-side uses `authClient` from `apps/web/src/lib/auth/client.ts`; server-side (RSC) uses `authServer` from `apps/web/src/lib/auth/server.ts`
3. **Backend → Auth**: `/api/auth/*` routes handled by Better Auth from `@milkpod/auth`
4. **Session Derivation**: Backend derives session via `auth.api.getSession` on every request

### Path Aliases

- `apps/web` uses `~/` for `apps/web/src/*`
- `apps/server` uses `~/` for `apps/server/src/*`
- Shared packages consumed via `@milkpod/*` imports

## Conventions

- Avoid editing `apps/web/src/components/ui/` unless fixing bugs or fulfilling explicit requirements (shadcn/ui components)
- Shared logic belongs in `packages/*`, consumed via `@milkpod/*` imports
- Avoid deep relative imports across packages
- Environment files: `apps/server/.env` and `apps/web/.env`

## Tree-Shaking & Package Boundaries

`@milkpod/ai` has server-only dependencies (`@ai-sdk/openai`, `@ai-sdk/google`, `drizzle-orm`, `@milkpod/db`). The barrel export (`@milkpod/ai`) re-exports everything, including modules that import these server packages. **Importing from `@milkpod/ai` in `apps/web` will pull Node.js modules (like `pg` → `dns`) into the Next.js bundle and break the build.**

Rules:
- **Frontend code must use subpath imports** — `@milkpod/ai/models`, `@milkpod/ai/limits`, `@milkpod/ai/types`, `@milkpod/ai/schemas`, etc. Never `@milkpod/ai`.
- **Keep client-safe modules free of server imports.** If a file is used on the frontend (e.g. `models.ts`, `limits.ts`, `types.ts`), it must not import `@ai-sdk/openai`, `@ai-sdk/google`, `drizzle-orm`, or any `@milkpod/db` module. Move server-only functions (like provider constructors) into server-only files (e.g. `stream.ts`).
- The same principle applies to all `@milkpod/*` packages — always check whether the subpath you're importing transitively pulls in Node.js-only code.
- Package exports use the `./*` wildcard pattern (`"types": "./dist/*.d.ts"`, `"default": "./src/*.ts"`), so any `src/*.ts` file is importable as `@milkpod/ai/*`.

## AI SDK (v6 / `ai` package)

This project uses AI SDK v6 (`ai@^6.0.0`) with `@ai-sdk/openai@^3.0.0`, `@ai-sdk/google@^3.0.0`, and `@ai-sdk/react@^3.0.0`. The API surface differs significantly from v3/v4 docs you may have been trained on. **When unsure about a type or function signature, check the actual `.d.ts` files in `node_modules/.pnpm/ai@*/node_modules/ai/dist/index.d.ts`** — do not guess from memory.

Key differences from older versions:
- `maxTokens` → `maxOutputTokens` in `streamText`/`generateText`
- `maxSteps` → `stopWhen: [stepCountIs(n)]`
- `tool()`: `parameters` → `inputSchema`
- `LanguageModel` type = `GlobalProviderModelId | LanguageModelV3 | LanguageModelV2` (union, not just a model instance)
- `streamText.onFinish` callback receives `StepResult<TOOLS> & { steps, totalUsage }` — `text`, `steps`, `toolCalls` etc. are all top-level properties
- Provider model ID types (`OpenAIChatModelId`, `GoogleGenerativeAIModelId`) are declared locally in their packages but **not exported** — use plain `string` and validate at runtime
- Provider functions (`openai()`, `google()`) accept any string via `(string & {})` in their union types

## Database Workflow

- **Never** use `db:push` — always `db:generate` then `db:migrate`
- For schema changes drizzle-kit can't auto-detect (renames vs creates), use `drizzle-kit generate --custom --name <name>` and write SQL manually
- After creating/modifying schema files, run `pnpm build` before `pnpm check-types` — downstream packages (`@milkpod/api`) resolve types from `dist/` via the `types` field in package.json exports. Stale `.d.ts` files cause phantom type errors.

## Keeping Agent Docs Useful

- Treat `packages/env/src/server.ts` and `packages/env/src/client.ts` as source of truth for app-level env validation
- Prefer `serverEnv()` / `clientEnv()` over direct `process.env` usage in app code
- When adding/changing env vars, update: env schema (`packages/env/src/*`), `apps/server/.env.example`, `apps/web/.env.example`, plus both `AGENTS.md` and `CLAUDE.md`
- If a package uses SDK-native env lookups (for example AI provider API keys), explicitly document those keys in the env section even if they are not validated in `@milkpod/env`

## Environment Variables

- `NEXT_PUBLIC_SERVER_URL` - API URL for web app (e.g., `http://localhost:3001`)
- `CORS_ORIGIN` - Allowed origin for Elysia CORS
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` - Better Auth configuration
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth provider
- `NODE_ENV` - Runtime mode (`development`, `production`, `test`)
- `ELEVENLABS_API_KEY` - Optional, required for ElevenLabs transcription in ingest flows
- `OPENAI_API_KEY` - Used by `@ai-sdk/openai` in `@milkpod/ai` (provider reads from process env)
- `GOOGLE_GENERATIVE_AI_API_KEY` - Used by `@ai-sdk/google` in `@milkpod/ai` (provider reads from process env)
