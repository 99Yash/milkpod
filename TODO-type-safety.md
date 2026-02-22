# Type Safety Audit — TODO

Results from the comprehensive TypeScript audit cross-referenced against Total TypeScript workshop patterns.

## Critical

- [x] **`as Part` assertions in `chat/service.ts:62-95`** — Intentionally kept. Reconstructing AI SDK discriminated union from DB rows requires type assertions; TypeScript can't verify this. Comment documents the reasoning.
- [x] **`t.Unsafe<MilkpodMessage>` + `t.Any()` in `chat/model.ts` and `shares/model.ts`** — Replaced `t.Any()` for metadata with `t.Record(t.String(), t.Unknown())`. The `t.Unsafe` wrapper is intentional (AI SDK parts union is too complex for TypeBox).
- [x] **Double-cast in `middleware/logger.ts:32`** — Replaced `(ctx as unknown as ...)` double-cast with `'user' in ctx` check + single narrowing cast.
- [x] **`usage?: unknown` in `packages/ai/src/types.ts:18`** — Replaced with `LanguageModelUsage` from `'ai'` package.

## Important

- [x] **Non-null assertions on `.returning()`** — Replaced `!` with explicit `if (!x) throw` in `AssetService.create`, `CollectionService.create`, `CollectionService.addItem`, `ShareService.create`.
- [x] **Hardcoded status string literals** — Derived `AssetStatus` from `assetStatusEnum.enumValues` in `IngestService` and `EpisodeStatus` from `episodeStatusEnum.enumValues` in `PodcastService`.
- [x] **Non-null assertions in batch loops** — Replaced `batch[j]!`/`vectors[j]!` index loops with `for...of` using `.entries()` and guard checks in both `pipeline.ts` and `episode-pipeline.ts`.
- [x] **Speaker `!` assertions in frontend** — Replaced `.filter(s => s.speaker).map(s => s.speaker!)` with `.map(s => s.speaker).filter((s): s is string => s != null)` type predicate in `asset-detail.tsx` and `shared-view.tsx`.
- [x] **`separators.find()!`** in `packages/ai/src/embeddings.ts` — Replaced `!` with `?? ''` fallback (the `''` sentinel guarantees a match, but `??` is safer for callers passing custom separators).
- [x] **`segOffsets[0]!`** in `packages/ai/src/embeddings.ts` — Added guard check before accessing first element.
- [~] **`as Response` cast** in `packages/api/src/modules/assets/index.ts:81` — Kept. Removing it causes `undici-types` portability error in the inferred Elysia route type. The cast is necessary to prevent `TS2742`.
- [x] **`GOOGLE_CLIENT_SECRET` optional/required mismatch** — Made `GOOGLE_CLIENT_SECRET` required in `packages/env/src/server.ts` to match usage in `packages/auth/src/index.ts`.

## Suggestions

- [x] **Explicit return type annotations on hooks** — Added to all 5 hooks in `apps/web/src/hooks/`: `useIsMobile`, `useLastAuthMethod`, `useMilkpodChat`, `useSharedChat`, `useAssetEvents`.
- [x] **Extract shared `uiMessage` TypeBox schema** — Moved duplicated schema from `chat/model.ts` and `shares/model.ts` into `packages/api/src/schemas.ts`, imported by both.
- [x] **Assertion function for auth session** — Added `assertAuthenticated()` to `apps/web/src/lib/auth/session.ts` using `asserts session is AuthenticatedSession` pattern. Applied in `dashboard/page.tsx`, `asset/[id]/page.tsx`, `collection/[id]/page.tsx`.
- [x] **`satisfies` operator for config objects** — Applied `as const satisfies Record<...>` to `OAUTH_PROVIDERS` and `PROVIDER_AUTH_OPTIONS` in `constants.tsx`, `ERROR_MESSAGES` in `errors.ts`, and `LIMITS` in `rate-limit.ts`.

## Already Done Well

- `AssetStatus` derived from `Asset['status']` via `InferSelectModel` (single source of truth)
- `isTerminalStatus` / `isProcessingStatus` type predicates
- `satisfies` already used in provider configs
- Strict tsconfig with `noUncheckedIndexedAccess: true`
- Eden Treaty for end-to-end type-safe client-server communication
- Discriminated union for `SharedResourceResult`
