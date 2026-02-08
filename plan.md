# Milkpod Implementation Plan

Ordered task list. Each task is a single commit. Work through them in order.

---

## Phase 1: Type Safety & Foundations

### Task 1: Branded ID types
**Files**: `packages/db/src/helpers.ts`, `packages/db/src/schema/*.ts`
**What**:
- Add `Brand<T, B>` type utility to helpers.ts
- Create branded types: `AssetId`, `UserId`, `ThreadId`, `CollectionId`, `TranscriptId`, `SegmentId`, `EmbeddingId`
- Update `createId()` to return the branded type for each prefix
- Update schema files to annotate `.$type<BrandedType>()` on ID columns
- Export all ID types from `packages/db`
**Why**: Prevents passing an AssetId where a ThreadId is expected. Catches bugs at compile time.
**Ref**: `../../tutorials/total-ts/advanced-patterns-workshop/src/01-branded-types/`

### Task 2: Shared API response types
**Files**: `packages/api/src/types.ts` (new), `apps/web/src/components/library/asset-list.tsx`, `apps/web/src/components/agent/agent-tab.tsx`
**What**:
- Create `packages/api/src/types.ts` using `InferSelectModel` from Drizzle schemas
- Define `AssetResponse`, `ThreadResponse`, `CollectionResponse`, `TranscriptSegmentResponse`
- Export from `packages/api`
- Replace all inline `interface Asset { ... }` and `as Asset[]` casts on the frontend with proper imports
**Why**: Single source of truth for API shapes. No more manual interface duplication.
**Ref**: `pro-essentials-workshop/src/040-deriving-types-from-values/`

### Task 3: Replace t.Any() message validation
**Files**: `packages/api/src/modules/chat/model.ts`
**What**:
- Define proper TypeBox schema for UI messages: `t.Object({ role, content, id, ... })`
- Add validation for `parts` array with discriminated `type` field
- Validate `assetId` as optional string, `collectionId` as optional string
**Why**: Malformed payloads currently blow up deep in convertToModelMessages with unhelpful errors.
**Ref**: AI_SDK_AUDIT.md #8

### Task 4: Shared tool output types
**Files**: `packages/ai/src/types.ts`, `packages/ai/src/tools.ts`, `apps/web/src/components/chat/tool-result.tsx`
**What**:
- Define `RetrieveSegmentsOutput` and `GetTranscriptContextOutput` interfaces in `packages/ai/src/types.ts`
- Use these types in tool `execute` return types
- Import and use on frontend instead of inline type assertions
- Export from `@milkpod/ai/types`
**Why**: Tool output shape changes will cause compile errors instead of silent runtime breakage.
**Ref**: AI_SDK_AUDIT.md #6

### Task 5: Discriminated union for asset status
**Files**: `packages/db/src/schema/media-assets.ts`, `packages/api/src/types.ts`, `apps/web/src/components/library/asset-card.tsx`, `apps/web/src/components/library/asset-list.tsx`
**What**:
- Define `AssetStatus` union type: `'queued' | 'fetching' | 'transcribing' | 'embedding' | 'ready' | 'failed'`
- Add `isTerminalStatus(s: AssetStatus): s is 'ready' | 'failed'` type predicate
- Add `isProcessingStatus(s: AssetStatus): s is 'queued' | 'fetching' | 'transcribing' | 'embedding'`
- Use in asset-list.tsx polling logic and asset-card.tsx status display
**Why**: String comparisons are error-prone. Type predicates narrow the type for downstream logic.
**Ref**: `pro-essentials-workshop/src/018-unions-and-narrowing/`, `085-the-utils-folder/221-type-predicates`

---

## Phase 2: Critical Fixes

### Task 6: Fix convertToModelMessages async
**Files**: `packages/ai/src/stream.ts`
**What**:
- `await convertToModelMessages(req.messages)` — it's async in AI SDK v6
- Make `createChatStream` async, returning `Promise<Response>`
- Update the chat endpoint caller if needed
**Why**: Currently passing a Promise object instead of actual messages. Silent breakage.
**Ref**: AI_SDK_AUDIT.md #1

### Task 7: Wire assetId/collectionId into chat context
**Files**: `packages/ai/src/stream.ts`, `packages/ai/src/tools.ts`, `packages/ai/src/system-prompt.ts`
**What**:
- In `createChatStream`, inject asset context into system prompt: `Current asset: ${assetId}`
- Pass `assetId` and `userId` into `createQAToolSet(context)` so tools are scoped
- In `retrieve_segments`, use the injected `context.assetId` instead of relying on the LLM
**Why**: Without this, the LLM has no way to know which asset the user is viewing. Also prevents cross-tenant data leakage.
**Ref**: AI_SDK_AUDIT.md #2, #10

### Task 8: Resource authorization
**Files**: `packages/api/src/modules/chat/index.ts`, `packages/api/src/modules/assets/index.ts`, `packages/api/src/modules/collections/index.ts`, `packages/api/src/modules/threads/index.ts`
**What**:
- In every endpoint that accepts a resource ID (threadId, assetId, collectionId), verify `session.user.id` matches the resource's `userId`
- Return 403 with clear error message on mismatch
- Add `userId` filter to all list queries (already partially done but verify)
**Why**: A logged-in user can currently query any other user's assets/threads.
**Ref**: AI_SDK_AUDIT.md #5

### Task 9: Handle reasoning tokens
**Files**: `apps/web/src/components/chat/message.tsx`, optionally `packages/ai/src/stream.ts`
**What**:
- Option A (preferred): Render reasoning parts in message.tsx as a collapsible "Thinking..." section
- Option B: Remove `sendReasoning: true` from streamText config
- Check if `part.type === 'reasoning'` exists in the message parts switch
**Why**: Reasoning tokens are sent to client but silently dropped. Wasted bandwidth or missing UX.
**Ref**: AI_SDK_AUDIT.md #7

### Task 10: Input guardrails
**Files**: `packages/ai/src/stream.ts`, `packages/ai/src/guardrails.ts` (new)
**What**:
- Create `packages/ai/src/guardrails.ts` with `checkInput(messages)` function
- Use a cheap/fast model (gpt-4o-mini) to classify: is this on-topic for transcript Q&A?
- Return early with a polite refusal if off-topic or inappropriate
- Call before `streamText` in `createChatStream`
**Why**: User-facing product should not send arbitrary prompts to expensive models.
**Ref**: AI_SDK_AUDIT.md #4

---

## Phase 3: Data & Persistence

### Task 11: Normalize message persistence
**Files**: `packages/db/src/schema/qa.ts`, new migration, `packages/api/src/modules/chat/service.ts`
**What**:
- Create `qa_message_parts` table: `id`, `messageId`, `type` (text|tool-invocation|reasoning), `textContent`, `toolName`, `toolInput` (jsonb), `toolOutput` (jsonb), `sortOrder`
- Update `saveMessages` to write parts into the new table
- Update `getMessages` to reconstruct `UIMessage[]` from parts
- Generate and run migration
**Why**: JSONB blobs are unqueryable. Normalized parts enable analytics, search, and selective loading.
**Ref**: AI_SDK_AUDIT.md #3

### Task 12: Embedding model versioning
**Files**: `packages/db/src/schema/embeddings.ts`, new migration, `packages/ai/src/embeddings.ts`
**What**:
- Add `model` (varchar, default 'text-embedding-3-small') and `dimensions` (integer, default 1536) columns
- Store model info when generating embeddings
- Add check in retrieval: warn if query embedding model differs from stored
**Why**: Future model changes would silently produce incompatible vectors.
**Ref**: AI_SDK_AUDIT.md #18

### Task 13: Pipeline error handling & retry
**Files**: `packages/api/src/modules/ingest/pipeline.ts`, `packages/api/src/modules/assets/index.ts`
**What**:
- Add exponential backoff with jitter to each pipeline stage
- Cap retries at 3 per stage
- Update `attempts` and `lastError` in DB on each failure
- Add `POST /api/assets/:id/retry` endpoint to re-trigger pipeline for failed assets
- Add retry button in asset-card.tsx for failed status
**Why**: Pipeline currently fails silently with no recovery path.
**Ref**: ARCHITECTURE.md "Durability rules"

---

## Phase 4: UX Improvements

### Task 14: Asset detail view
**Files**: `apps/web/src/app/asset/[id]/page.tsx` (new), new components
**What**:
- Server component that fetches asset + transcript + segments
- Full transcript view with timestamps and speaker labels
- Clickable timestamps
- Side panel with chat (ChatPanel component reuse)
- Back navigation to dashboard
**Why**: Users need to see the full transcript, not just chat about it.

### Task 15: Collection management UI
**Files**: `apps/web/src/components/library/` (new components)
**What**:
- Collection list view in library tab
- Create collection dialog
- Add/remove assets from collections
- Collection detail view showing member assets
- Enable scoped Q&A (pass collectionId to chat)
**Why**: Collections exist in the API but have no UI.

### Task 16: Streaming progress indicators
**Files**: `apps/web/src/components/library/asset-card.tsx`, `packages/api/src/modules/ingest/pipeline.ts`
**What**:
- Replace setInterval polling with SSE endpoint for asset status
- Pipeline emits progress events (stage, percentage)
- Asset card shows progress bar and current stage label
- Falls back to polling if SSE connection drops
**Why**: Polling is wasteful and laggy. Users deserve real-time feedback.

### Task 17: Search and filter
**Files**: `apps/web/src/components/library/`, `packages/api/src/modules/assets/`
**What**:
- Add search input in library tab
- API: `GET /api/assets?q=...&status=...&sourceType=...`
- Full-text search on asset title
- Filter by status and source type
- Debounced search input on frontend
**Why**: As the library grows, users need to find specific content.

---

## Phase 5: Sharing & Access Control

### Task 18: Share link schema & API
**Files**: `packages/db/src/schema/share-links.ts` (new), `packages/api/src/modules/shares/` (new)
**What**:
- `share_links` table: id, token, userId, assetId?, collectionId?, canQuery, expiresAt, revokedAt
- `POST /api/shares` — create share link
- `DELETE /api/shares/:id` — revoke
- `GET /api/shares/validate/:token` — validate and return scoped data
**Why**: Required for read-only sharing feature.

### Task 19: Share link UI
**Files**: `apps/web/src/components/` (new components), `apps/web/src/app/share/[token]/page.tsx` (new)
**What**:
- Share button on asset cards and collection views
- Dialog with link copy, expiry selector, can_query toggle
- Public share page: read-only transcript view
- Optional: embedded chat with rate limits
**Why**: Users want to share transcripts with others.

### Task 20: Rate-limited shared Q&A
**Files**: `packages/api/src/modules/shares/`, rate limit middleware
**What**:
- Share-scoped chat endpoint with stricter limits
- Per-token rate limiting (e.g., 10 questions/hour)
- Separate query log (share_queries table)
- No write access to owner's threads
**Why**: Shared access needs guardrails to prevent abuse.

---

## Phase 6: Production Hardening

### Task 21: Request logging middleware
**Files**: `packages/api/src/middleware/logger.ts` (new), `packages/api/src/index.ts`
**What**:
- Elysia plugin that logs: method, path, status, duration, userId
- Structured JSON format for log aggregation
- Skip logging for health checks
**Why**: Can't debug production issues without request logs.

### Task 22: Rate limiting
**Files**: `packages/api/src/middleware/rate-limit.ts` (new)
**What**:
- Token bucket rate limiter per user
- Different limits per endpoint category (ingest: 10/min, chat: 30/min, CRUD: 100/min)
- Return 429 with retry-after header
**Why**: Prevents abuse and runaway costs.

### Task 23: Health checks & graceful shutdown
**Files**: `apps/server/src/index.ts`, `packages/api/src/index.ts`
**What**:
- `/health` checks DB connectivity (simple query)
- `/ready` checks all dependencies
- Graceful shutdown: drain in-flight requests, close DB pool
**Why**: Required for production deployment behind a load balancer.

### Task 24: Error boundaries & offline handling
**Files**: `apps/web/src/app/error.tsx` (new), `apps/web/src/components/`
**What**:
- React error boundaries around dashboard, library, agent sections
- Offline detection with banner
- Retry buttons on failed network requests
**Why**: Unhandled errors currently white-screen the app.

---

## Phase 7: Podcast Features (Future)

### Task 25–28: Podcast feed schema, RSS ingestion, filtering, private RSS/Plex
These are deferred. See ARCHITECTURE.md for full design.

---

## TypeScript Patterns to Apply Throughout

From `../../tutorials/total-ts/`:

| Pattern | Where to use | Tutorial ref |
|---------|-------------|--------------|
| Branded types (`Brand<T, B>`) | All entity IDs | advanced-patterns/01-branded-types |
| Type predicates (`value is T`) | API response narrowing, status checks | pro-essentials/085/221-type-predicates |
| Assertion functions (`asserts value is T`) | Auth middleware, ownership checks | pro-essentials/085/222-assertion-functions |
| Discriminated unions | Asset status, message part types | pro-essentials/018-unions-and-narrowing |
| Deriving types from values (`typeof` + `as const`) | Drizzle schema → API types | pro-essentials/040-deriving-types-from-values |
| Generic function inference | Service methods, API handlers | pro-essentials/085/217-generic-functions |
| `satisfies` keyword | Config objects, tool definitions | pro-essentials/045-annotations-and-assertions |
| Generic type constraints | Tool factory, middleware | pro-essentials/085/218-type-parameter-constraints |
| Function overloads | API methods with different return shapes | pro-essentials/085/223-function-overloads |
| Curried generics | Tool factory `createQAToolSet(ctx)(config)` | typescript-generics/01-generics-intro |
| `Maybe<T>` type helper | Nullable DB columns | type-transformations/03.5-type-helpers |
| React generic components | Asset list with generic item type | react-typescript-tutorial/05-generics |
| Discriminated union props | Component props with mode/variant | react-typescript-tutorial/04-advanced-props |
