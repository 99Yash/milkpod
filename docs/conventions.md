# Conventions

## UI components

`apps/web/src/components/ui/` holds shadcn/ui primitives. Leave them alone unless fixing a bug or satisfying an explicit requirement.

## Shared code

Logic that more than one app or package needs belongs in `packages/*`, consumed via `@milkpod/*` imports. Prefer subpath imports over reaching into a package's internals with relative paths.

## SSR safety

Next.js App Router server-renders `'use client'` components. Any code path that touches `localStorage`, `window`, `document`, `navigator`, or other browser-only APIs must be gated — either behind `typeof window !== 'undefined'` or deferred to `useEffect`. `useState` initializers run on the server too, so the same rule applies to them.

## Library leverage

Before writing logic by hand, confirm the library doesn't already expose it. Read `.d.ts` files in `node_modules/.pnpm/` for real signatures rather than guessing, and search `elysiajs/elysia`, `drizzle-team/drizzle-orm`, or `vercel/ai` for API examples. Drizzle relational queries beat manual joins, Elysia `.guard()` / `.onError()` beats per-route boilerplate, and AI SDK `Output` beats manual JSON parsing.

For the full review checklist (backend hazards, frontend hygiene, composability), see `review-prompt.md`.
