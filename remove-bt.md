# Remove Type Assertions Plan

The branded ID types (`Brand<T,B>`, `.$type<>()`, generic `createId<T>()`) were already removed in earlier work. What remains are ~30 `as` type assertions scattered across the codebase. Most stem from Eden Treaty's inability to discriminate Elysia's union return types (`SuccessData | { message: string }`). The rest are deserialization casts, framework workarounds, and external API typing.

This plan eliminates every avoidable `as` cast. Casts that are inherent to the framework/library boundary (Elysia context access, Next.js Route type, `response.json()`, EventEmitter typing) are left alone — they cannot be removed without changing libraries.

Work through tasks in order. Run `pnpm check-types` after each task.

---

## [x] Task 1: Create typed Eden wrapper (`apps/web/src/lib/api-fetchers.ts`)

**Why**: 11 frontend components cast Eden `data` with `as SomeType`. The root cause is that Elysia routes return `SuccessType | { message: string }`, so Eden infers `data` as a union. Moving the narrowing logic into typed wrapper functions eliminates `as` from every call site.

**What**:
- Create `apps/web/src/lib/api-fetchers.ts` with typed async functions for each API call that currently requires a cast:
  ```ts
  export async function fetchAssets(query?: Record<string, string>): Promise<Asset[]>
  export async function fetchAssetDetail(id: string): Promise<AssetData | null>
  export async function fetchCollections(): Promise<Collection[]>
  export async function fetchCollectionDetail(id: string): Promise<CollectionWithItems | null>
  export async function fetchShareLinks(): Promise<ShareLink[]>
  export async function createShareLink(body: ...): Promise<ShareLink | null>
  export async function fetchSharedResource(token: string): Promise<SharedData | null>
  export async function fetchChatMessages(threadId: string): Promise<{ threadId: string; messages: MilkpodMessage[] } | null>
  ```
- Each function calls the Eden client, checks `error`/`!data`, and returns the typed result. The single `as` cast (if needed) lives inside the function body, guarded by runtime checks.
- Export all types needed by consumers (`AssetData`, `SharedData`) from this file or from `@milkpod/api/types`.

**Files**: `apps/web/src/lib/api-fetchers.ts` (new)

---

## [x] Task 2: Refactor asset components to use typed fetchers

**Why**: Eliminates `as Asset[]` and `as AssetData` casts from 4 files.

**What**:
- `apps/web/src/components/asset/asset-detail.tsx`: Replace inline `api.api.assets({ id }).get()` calls with `fetchAssetDetail(assetId)`. Remove `data as AssetData` casts (lines 72, 103). The `AssetData` type can move to `api-fetchers.ts` or `@milkpod/api/types`.
- `apps/web/src/components/library/asset-list.tsx`: Replace `api.api.assets.get({ query })` with `fetchAssets(query)`. Remove `data as Asset[]` cast (line 37). Remove `Array.isArray` guard (handled by fetcher).
- `apps/web/src/components/collection/add-asset-to-collection-dialog.tsx`: Replace with `fetchAssets()`. Remove `data as Asset[]` cast (line 46).
- `apps/web/src/components/agent/agent-tab.tsx`: Replace with `fetchAssets()`. Remove `data as Asset[]` cast (line 29).

**Files**: `asset-detail.tsx`, `asset-list.tsx`, `add-asset-to-collection-dialog.tsx`, `agent-tab.tsx`

---

## [x] Task 3: Refactor collection components to use typed fetchers

**Why**: Eliminates `as Collection[]` and `as CollectionWithItems` casts from 3 files.

**What**:
- `apps/web/src/components/collection/collection-detail.tsx`: Replace with `fetchCollectionDetail(collectionId)`. Remove `data as CollectionWithItems` cast (line 54).
- `apps/web/src/components/library/collection-list.tsx`: Replace with `fetchCollections()`. Remove `data as Collection[]` cast (line 22).
- `apps/web/src/components/library/add-to-collection-dialog.tsx`: Replace with `fetchCollections()`. Remove `data as Collection[]` cast (line 44).

**Files**: `collection-detail.tsx`, `collection-list.tsx`, `add-to-collection-dialog.tsx`

---

## [x] Task 4: Refactor share + chat components to use typed fetchers

**Why**: Eliminates `as ShareLink[]`, `as ShareLink`, `as SharedData`, `as MilkpodMessage[]` casts from 3 files.

**What**:
- `apps/web/src/components/share/share-dialog.tsx`: Replace with `fetchShareLinks()` and `createShareLink(...)`. Remove `data as ShareLink[]` (line 98) and `data as ShareLink` (line 128).
- `apps/web/src/components/share/shared-view.tsx`: Replace with `fetchSharedResource(token)`. Remove `result as SharedData` (line 74).
- `apps/web/src/components/chat/chat-panel.tsx`: Replace with `fetchChatMessages(threadId)`. Remove `data.messages as MilkpodMessage[]` (line 34). Remove `'messages' in data` guard (handled by fetcher).

**Files**: `share-dialog.tsx`, `shared-view.tsx`, `chat-panel.tsx`

---

## [x] Task 5: Fix `url-input-form.tsx` error value cast

**Why**: Eliminates `error.value as { message: string }` cast.

**What**:
- In `apps/web/src/components/library/url-input-form.tsx` (line 29), replace the cast with a runtime check:
  ```ts
  const msg = typeof error.value === 'object' && error.value && 'message' in error.value
    ? String((error.value as Record<string, unknown>).message)
    : 'Failed to add video';
  ```
  Or better: create a small `getErrorMessage(error: unknown): string` helper (or reuse the existing one from `~/lib/utils`) that safely extracts the message without a cast.

**Files**: `url-input-form.tsx`

---

## [x] Task 6: Fix OAuth `providerId` cast

**Why**: Eliminates `provider.id as OAuthProviderId` cast in `oauth-buttons.tsx`.

**What**:
- In `apps/web/src/lib/constants.tsx`, type the `id` field of `OAuthProvider` as `OAuthProviderId` instead of `string`. This makes `OAUTH_PROVIDERS[key].id` automatically typed as `OAuthProviderId`.
- In `oauth-buttons.tsx` (line 89), remove the `as OAuthProviderId` cast — it's no longer needed.
- Also remove the `providerId.toUpperCase() as AuthOptionsType` cast (line 27) by deriving it properly or using a lookup.

**Files**: `constants.tsx`, `oauth-buttons.tsx`

---

## [x] Task 7: Fix `chat/service.ts` deserialization casts

**Why**: Eliminates 6 `as Part` casts in `deserializePart` and 1 `as 'user' | 'assistant'` cast.

**What**:
- For the role cast (`row.role as 'user' | 'assistant'` on line 136): Add a column-level type constraint in the Drizzle schema for `qaMessages.role`, or define a `MessageRole` type and add a type guard:
  ```ts
  type MessageRole = 'user' | 'assistant';
  function isMessageRole(s: string): s is MessageRole {
    return s === 'user' || s === 'assistant';
  }
  ```
  Use the guard instead of the cast.
- For the `as Part` casts in `deserializePart`: These reconstruct an AI SDK discriminated union (`UIMessage['parts'][number]`) from DB rows. The `as Part` is needed because TypeScript can't verify object literals match a complex union type from an external library. Replace with `satisfies` where possible, or keep as-is if `satisfies` doesn't work with the AI SDK union (it may not since the union is externally defined). If they can't be cleanly eliminated, document why with a `// Type assertion required: reconstructing AI SDK discriminated union from DB` comment and move on.

**Files**: `packages/api/src/modules/chat/service.ts`

---

## [x] Task 8: Fix `assets/service.ts` enum narrowing casts

**Why**: Eliminates 2 `as Array<...enum...>` casts in query parameter parsing.

**What**:
- In `packages/api/src/modules/assets/service.ts` (lines 28-30, 38-40), replace the casts with type guard filters:
  ```ts
  const VALID_STATUSES = new Set(['queued', 'fetching', 'transcribing', 'embedding', 'ready', 'failed'] as const);
  type ValidStatus = typeof VALID_STATUSES extends Set<infer T> ? T : never;

  const statuses = query.status
    .split(',')
    .filter((s): s is ValidStatus => VALID_STATUSES.has(s as ValidStatus));
  ```
  Same pattern for `sourceType`. This replaces the `as Array<...>` cast with a proper type guard that also does runtime validation (rejecting invalid values).

**Files**: `packages/api/src/modules/assets/service.ts`

---

## [x] Task 9: Fix `message.tsx` tool output cast

**Why**: Eliminates `part.output as ToolOutput` cast.

**What**:
- In `apps/web/src/components/chat/message.tsx` (line 75), `part.output` is typed as `unknown` by the AI SDK. Options:
  - Create a `parseToolOutput(output: unknown): ToolOutput` function (in `@milkpod/ai/types` or locally) that does a runtime shape check and returns the typed output, falling back to the `fallbackOutput`.
  - Or use a Zod schema for `ToolOutput` and parse at the boundary.
- The simplest safe approach: a type guard function `isToolOutput(val: unknown): val is ToolOutput` that checks for the `status` and `query`/`segments` fields.

**Files**: `message.tsx`, optionally `packages/ai/src/types.ts`

---

## Summary of casts left intentionally

These `as` assertions are inherent to library/framework boundaries and cannot be removed:

| File | Cast | Reason |
|------|------|--------|
| `routes.ts` | `value as Route` | Next.js Route type has no runtime equivalent |
| `rate-limit.ts` | `ctx as unknown as { session? }` | Elysia plugins can't see parent-derived context types |
| `logger.ts` | `ctx as unknown as { session? }` | Same Elysia limitation |
| `asset-events.ts` | `new EventEmitter() as TypedEventBus` | Standard typed EventEmitter pattern |
| `elevenlabs.ts` | `response.json() as TranscriptionResult` | `fetch` returns `any` for JSON |
| `shares/service.ts` | `'asset' as const` / `'collection' as const` | Literal type narrowing (not casts) |
| `constants.tsx` | `as const` on objects | Literal type narrowing (not casts) |
