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
pnpm db:push          # Push Drizzle schema to database
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

## Environment Variables

- `NEXT_PUBLIC_SERVER_URL` - API URL for web app (e.g., `http://localhost:3001`)
- `CORS_ORIGIN` - Allowed origin for Elysia CORS
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` - Better Auth configuration
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth provider (optional)
