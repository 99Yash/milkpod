# CLAUDE.md

Milkpod is an AI video transcription and Q&A workspace: users upload or link videos to get timestamped transcripts with speaker labels, ask questions with timestamped answers, and generate highlights.

It's a `pnpm` + Turborepo monorepo with a Next.js App Router frontend (`apps/web`, port 3000) and an Elysia backend (`apps/server`, port 3001).

## Commands

`pnpm dev`, `pnpm build`, and `pnpm check-types` behave as you'd expect. Two non-standard notes:

- Use `pnpm db:generate` then `pnpm db:migrate` for schema changes. `pnpm db:push` is legacy — see `docs/database.md`.
- After editing schema files, run `pnpm build` before `pnpm check-types`. Downstream packages resolve types from `dist/`, so stale `.d.ts` files surface as phantom type errors.

## Guides

- For the workspace layout, data flow, and path aliases, see `docs/architecture.md`.
- For day-to-day conventions (SSR guards, shadcn, shared-package hygiene, library leverage), see `docs/conventions.md`.
- For `@milkpod/*` tree-shaking and subpath-import rules, see `docs/package-boundaries.md`.
- For AI SDK v6 API differences, see `docs/ai-sdk-v6-patterns.md`.
- For the database migration workflow, see `docs/database.md`.
- For environment variables and env-var hygiene, see `docs/environment.md`.
- For TypeScript patterns (discriminated unions, branded types, generics, `satisfies`, mapped types), see `docs/typescript-patterns.md`.
- For the full code review checklist, see `review-prompt.md`.
