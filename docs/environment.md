# Environment variables

Environment files live at `apps/server/.env` and `apps/web/.env`. Validation lives in `packages/env/src/server.ts` and `packages/env/src/client.ts` — they are the source of truth for app-level env use. Prefer `serverEnv()` / `clientEnv()` over reaching into `process.env` directly.

When adding or changing an env var, update:

- the schema in `packages/env/src/*`,
- `apps/server/.env.example` and `apps/web/.env.example`,
- both `CLAUDE.md` (via this file) and `AGENTS.md`.

Some packages rely on SDK-native env lookups (AI provider API keys, for example) and aren't validated in `@milkpod/env`. Document those here anyway so the full set is discoverable.

## Core

- `NEXT_PUBLIC_SERVER_URL` — API URL for the web app (e.g. `http://localhost:3001`).
- `CORS_ORIGIN` — allowed origin for Elysia CORS.
- `NODE_ENV` — runtime mode (`development`, `production`, `test`).

## Database

- `DATABASE_URL` — PostgreSQL connection string.

## Auth

- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` — Better Auth configuration.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth provider.
- `COOKIE_DOMAIN` — Better Auth cookie domain (required in production, optional in dev/test).
- `ADMIN_EMAILS` — comma-separated admin emails; these users bypass the daily word quota.

## Email

- `RESEND_API_KEY` — required for sending email OTP codes via Resend.
- `AUTH_FROM_EMAIL` — optional sender identity (defaults to `Milkpod <noreply@croisillies.xyz>`).

## Transcription

- `ASSEMBLYAI_API_KEY` — required for AssemblyAI transcription in ingest flows.

## Upload storage (S3-compatible)

- `UPLOAD_STORAGE_BUCKET` — S3-compatible bucket for durable manual uploads.
- `UPLOAD_STORAGE_REGION` — bucket region (`auto` works for providers like R2).
- `UPLOAD_STORAGE_ENDPOINT` — optional custom S3 endpoint (R2, MinIO, etc.).
- `UPLOAD_STORAGE_ACCESS_KEY_ID` / `UPLOAD_STORAGE_SECRET_ACCESS_KEY` — credentials.
- `UPLOAD_STORAGE_FORCE_PATH_STYLE` — `true` for path-style providers, else `false`.
- `UPLOAD_STORAGE_SIGNED_URL_TTL_SECONDS` — lifetime for signed download URLs used in ingest.

## AI providers

These are read directly by the SDKs, not validated centrally.

- `OPENAI_API_KEY` — `@ai-sdk/openai`.
- `ANTHROPIC_API_KEY` — `@ai-sdk/anthropic`.
- `GOOGLE_GENERATIVE_AI_API_KEY` — `@ai-sdk/google`.

## Infrastructure

- `REDIS_URL` — Redis connection string for the BullMQ durable job queue and Redis pub/sub SSE events (Node only). On Cloudflare Workers the DB `realtime_event` outbox replaces Redis pub/sub — no new env needed.

## Billing (optional)

- `BILLING_PROVIDER` — set to `polar` (or `razorpay`) to enable billing routes; omit to disable.
- `POLAR_ACCESS_TOKEN` — Polar organization access token (required when `BILLING_PROVIDER=polar`).
- `POLAR_WEBHOOK_SECRET` — Polar webhook signing secret (`whsec_…`, required when `BILLING_PROVIDER=polar`).
- `POLAR_PRODUCT_PRO` — comma-separated Polar product UUIDs for the Pro plan (monthly, yearly).
- `POLAR_PRODUCT_TEAM` — comma-separated Polar product UUIDs for the Team plan (monthly, yearly).
