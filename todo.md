# Code Review: `fix/lcp-ask-ai` vs `main`

Review against React + TypeScript best practices (Total TypeScript patterns) and AI SDK v6 patterns.

---

## TypeScript Issues

### 1. `ToolOutput` union is not a proper discriminated union
**File:** `packages/ai/src/types.ts:65-68`

`RetrieveSegmentsOutput`, `GetTranscriptContextOutput`, and `ReadTranscriptOutput` all share a `status` field but with overlapping values (`'loading'` appears in two variants). There is no unique discriminator — TypeScript can't narrow via `output.status`. The `isToolOutput` type guard (line 71) only validates the shape, it can't tell which variant you have.

**Fix:** Add a literal `kind` (or `tool`) discriminator to each variant, e.g. `kind: 'retrieve'`, `kind: 'context'`, `kind: 'read'`. Then `tool-result.tsx` can narrow with a switch instead of string-checking `output.status`.

### 2. `as Part` assertions in `deserializePart` bypass type checking
**File:** `apps/web/src/lib/data/queries.ts:78-105`

Every branch casts the return with `as Part`. If the `Part` union changes upstream (e.g. a field rename in the AI SDK), these assertions will silently produce wrong types at runtime — the compiler won't catch the mismatch.

**Fix:** Use a `satisfies Part` check per branch (TS 4.9+), or build a discriminated-union constructor map keyed by `row.type` so each branch is structurally verified.

### 3. `as { id: string }` assertion in fetcher
**File:** `apps/web/src/lib/api-fetchers.ts:111`

```ts
return data[0] as { id: string };
```

Eden treaty already knows the response shape. The `as` assertion bypasses that — if the API changes, this won't error at compile time. This pattern also exists in `fetchAssetDetail`, `fetchCollectionDetail`, etc. (pre-existing, but the new `fetchLatestThreadForAsset` follows the same antipattern).

**Fix:** Either narrow via Eden's inferred type or use `satisfies` to validate the shape.

### 4. `tool-result.tsx` accesses properties not on every variant
**File:** `apps/web/src/components/chat/tool-result.tsx:53`

```ts
'segmentId' in segment ? segment.segmentId : segment.id;
```

This runtime `in` check works but is needed only because the `ToolOutput` union's `segments` array has two different shapes (`RelevantSegment` vs `ContextSegment`). Fixing issue #1 (discriminated union) would let you narrow cleanly and avoid the `in` check.

---

## React Issues

### 5. Two `eslint-disable react-hooks/exhaustive-deps` in `FlatView`
**File:** `apps/web/src/components/asset/transcript/flat-view.tsx:60, 78`

Both `useEffect` hooks suppress exhaustive-deps. They intentionally omit `virtualizer` (stable ref) and the derived index values. Even though technically correct at runtime, suppressing the lint rule masks future regressions if the hook dependencies change.

**Fix:** Include all deps. `virtualizer` from `useVirtualizer` is a stable object and `activeGroupIndex`/`activeMatchRowIndex` are already derived from the same source values — including them won't cause extra scrolls and lets the linter protect you.

### 6. `useRestoredThread` — silent error swallowing
**File:** `apps/web/src/components/chat/chat-panel.tsx:73-75`

```ts
.catch(() => {
  // No existing thread — start fresh
})
```

This catches **all** errors (network failures, 500s, JSON parse errors) — not just "no thread found". The `fetchLatestThreadForAsset` already returns `null` when no thread exists, so a non-null error here is a real failure that gets silently swallowed.

**Fix:** Either `toast.error(...)` like the `explicitThreadId` branch does, or at minimum log the error.

### 7. `undefined` vs `null` tri-state for `initialThread` prop
**File:** `apps/web/src/components/chat/chat-panel.tsx:22-26`

```ts
initialThread?: { threadId: string; messages: MilkpodMessage[] } | null;
```

The comment explains `null` = no thread, `undefined` = not fetched server-side. This overloads `undefined` with semantic meaning, which is fragile — React defaulting an omitted prop to `undefined` makes it easy to accidentally trigger the "not fetched" branch.

**Fix:** Use a discriminated union prop:
```ts
initialThread:
  | { status: 'loaded'; threadId: string; messages: MilkpodMessage[] }
  | { status: 'empty' }
  | { status: 'not-fetched' };
```
Or at minimum, a boolean `serverFetched` flag alongside the nullable data.

### 8. `handleSubmit` / `handleKeyDown` not memoized
**File:** `apps/web/src/components/chat/chat-panel.tsx:118-131`

`handleSubmit` and `handleKeyDown` are redeclared every render. They're passed to `<form onSubmit>` and `<Textarea onKeyDown>` — not a huge deal for native elements, but wrapping in `useCallback` is free and consistent with the rest of the codebase (e.g. `useMilkpodChat` uses `useCallback` for similar functions). With the React Compiler this is moot, but worth being consistent.

---

## AI SDK v6 Issues

### 9. `onFinish` saves ALL assistant messages, not just the new response
**File:** `packages/api/src/modules/chat/index.ts:64-69`

```ts
onFinish: async ({ messages }) => {
  const assistantMessages = messages.filter(
    (m) => m.role === 'assistant'
  );
  await ChatService.saveMessages(threadId!, assistantMessages);
},
```

The `messages` parameter in `toUIMessageStreamResponse`'s `onFinish` contains the **full conversation history** including the new response. Filtering by `role === 'assistant'` gives you **every** assistant message ever sent — not just the new one. This re-saves previously persisted messages on every request.

**Fix:** Use `responseMessage` (the singular new assistant message) instead:
```ts
onFinish: async ({ responseMessage }) => {
  await ChatService.saveMessages(threadId!, [responseMessage]);
},
```
This is the pattern the AI SDK docs and crash course recommend for persistence.

### 10. `readTranscriptTool` — empty `inputSchema` but typed as generic
**File:** `packages/ai/src/tools.ts:101-104`

```ts
const readTranscriptInput = z.object({});
const readTranscriptTool = tool<
  z.infer<typeof readTranscriptInput>,
  ReadTranscriptOutput
>({...});
```

The explicit generic parameters `tool<Input, Output>` are unnecessary — the AI SDK infers both from `inputSchema` and the generator return type. The explicit generics add maintenance burden with no type safety benefit (they're assertions, not checks).

**Fix:** Drop the explicit generics and let inference work:
```ts
const readTranscriptTool = tool({
  description: '...',
  inputSchema: readTranscriptInput,
  execute: async function* () { ... },
});
```
Same applies to `retrieveSegmentsTool` and `getTranscriptContextTool`.

### 11. Generator tools yield correct streaming pattern
**File:** `packages/ai/src/tools.ts` (all three tools)

The `async function*` pattern with intermediate `yield` (e.g. yielding `{ status: 'searching', ... }` before the actual result) correctly leverages AI SDK v6's preliminary tool results. The frontend sees the loading state while the tool executes. This is well done.

### 12. `createChatStream` uses `system` correctly (not `instructions`)
**File:** `packages/ai/src/stream.ts:53`

`streamText()` uses the `system` parameter, which is correct. (`instructions` is only for `ToolLoopAgent`.) No issue.

### 13. `convertToModelMessages` is correctly awaited
**File:** `packages/ai/src/stream.ts:48`

In v6, `convertToModelMessages` became async. The code correctly `await`s it. No issue.

---

## Minor / Nits

### 14. `flatMap` returning a bare object
**File:** `apps/web/src/lib/data/queries.ts:150-157`

```ts
messageRows.flatMap<MilkpodMessage>((row) => {
  if (!isMessageRole(row.role)) return [];
  return { id: row.id, ... };  // bare object, not wrapped in []
});
```

`flatMap` accepts `T | ReadonlyArray<T>`, so this works, but it's unconventional — readers expect `.flatMap` callbacks to return arrays. Wrapping the happy path in `[{ ... }]` makes the filter-map intent clearer, or just use `.filter(r => isMessageRole(r.role)).map(...)`.

### 15. `Map.groupBy` requires ES2024 lib
**File:** `apps/web/src/lib/data/queries.ts:148`

`Map.groupBy` is an ES2024 static method. Make sure your `tsconfig` includes `"lib": ["ES2024"]` or a polyfill. This file is `server-only` so Node 22+ has it natively, but if the Node target ever drops below 22, it'll be a runtime error.

### 16. Inline styles on virtualizer wrapper could be extracted
**File:** `apps/web/src/components/asset/transcript/flat-view.tsx:91-95`

The outer `div` uses a style object literal, creating a new object every render. For a virtualizer this is standard practice (TanStack docs show the same pattern), so not a real issue — just noting it.

### 17. `body` in `useMilkpodChat` changed from `useMemo` to `useCallback`
**File:** `apps/web/src/hooks/use-milkpod-chat.ts:41-48`

`body` was previously `useMemo(() => ({ ... }), deps)` (returns an object) and is now `useCallback(() => ({ ... }), deps)` (returns a function). This is intentional (transport calls `body()` lazily to get fresh `threadIdRef.current`), but worth noting that the semantics changed — `useCallback` memoizes the function identity, not the return value. This is correct for the use case.

---

## Summary

| # | Severity | Category | File |
|---|----------|----------|------|
| 1 | Medium | TS - Non-discriminated union | `packages/ai/src/types.ts` |
| 2 | Medium | TS - Unsafe `as` casts | `apps/web/src/lib/data/queries.ts` |
| 3 | Low | TS - Unsafe `as` cast | `apps/web/src/lib/api-fetchers.ts` |
| 4 | Low | TS - Runtime `in` check workaround | `apps/web/src/components/chat/tool-result.tsx` |
| 5 | Medium | React - Suppressed lint rule | `apps/web/src/components/asset/transcript/flat-view.tsx` |
| 6 | Medium | React - Silent error swallowing | `apps/web/src/components/chat/chat-panel.tsx` |
| 7 | Low | React/TS - Fragile tri-state prop | `apps/web/src/components/chat/chat-panel.tsx` |
| 8 | Low | React - Unmemoized handlers | `apps/web/src/components/chat/chat-panel.tsx` |
| 9 | **High** | AI SDK - Re-saves all assistant msgs | `packages/api/src/modules/chat/index.ts` |
| 10 | Low | AI SDK - Unnecessary explicit generics | `packages/ai/src/tools.ts` |
| 11 | OK | AI SDK - Generator tool streaming | `packages/ai/src/tools.ts` |
| 12 | OK | AI SDK - `system` param correct | `packages/ai/src/stream.ts` |
| 13 | OK | AI SDK - Async `convertToModelMessages` | `packages/ai/src/stream.ts` |
| 14 | Nit | TS - Unconventional flatMap | `apps/web/src/lib/data/queries.ts` |
| 15 | Nit | TS - ES2024 lib dependency | `apps/web/src/lib/data/queries.ts` |
| 16 | Nit | React - Inline style objects | `apps/web/src/components/asset/transcript/flat-view.tsx` |
| 17 | Info | React - Semantic change memo→callback | `apps/web/src/hooks/use-milkpod-chat.ts` |
