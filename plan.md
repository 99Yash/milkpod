# Milkpod Audit Fix Plan

Ordered task list. Work through them in order. Each task references findings in `PRD.md`.

---

## Phase 1: Security & Data Integrity

### ~~Task 1: Add missing database indexes~~ ✅

**Refs**: DB-1
**Files**: New migration in `packages/db/src/schema/collections.ts`, `qa.ts`, `share-links.ts`, `share-queries.ts`, `transcript-segments.ts`, `media-assets.ts`
**What**:

- ~~Add index on `collectionItems.collectionId`~~
- ~~Add index on `collectionItems.assetId`~~
- ~~Add index on `qaEvidence.messageId`~~
- ~~Add index on `qaEvidence.segmentId`~~
- ~~Add compound index on `shareQueries(shareLinkId, createdAt)`~~
- ~~Add compound index on `mediaAssets(userId, status)`~~
- ~~Add compound index on `transcriptSegments(transcriptId, segmentIndex)`~~
- ~~Run `pnpm db:generate` and `pnpm db:migrate`~~

### ~~Task 2: Fix guardrails to fail closed~~ ✅

**Refs**: SEC-1
**Files**: `packages/ai/src/guardrails.ts`
**What**:

- ~~Change the catch block to return `{ allowed: false, reason: 'Classification unavailable' }` instead of `{ allowed: true }`~~
- ~~Add a simple heuristic fallback: if the guardrail model is unreachable, check message length and basic keyword patterns before denying~~
- ~~Update the caller in `stream.ts` to handle the new denial reason and return a user-friendly message~~

### Task 3: Add timeout to AI streaming requests

**Refs**: SEC-3
**Files**: `packages/ai/src/stream.ts`
**What**:

- Create an `AbortController` with a 60-second timeout before calling `streamText()`
- Pass `abortSignal: controller.signal` to the `streamText()` options
- In the `onFinish` callback, clear the timeout
- Handle `AbortError` gracefully — return a message like "Response timed out, please try again"

### Task 4: Switch rate limiter to user-based with IP fallback

**Refs**: SEC-4
**Files**: `packages/api/src/middleware/rate-limit.ts`
**What**:

- Change the rate limiter key from IP to `userId` when session is available
- Fall back to IP for unauthenticated routes (health, share validation)
- Keep the existing bucket categories (ingest: 10/min, chat: 30/min, crud: 100/min)

### Task 5: Add request body size limit

**Refs**: API-2
**Files**: `apps/server/src/index.ts`
**What**:

- Add body size limit to the Elysia server config. Check Elysia docs for the right API — likely a plugin or server option
- Set a reasonable limit (e.g. 2MB for regular endpoints, 10MB for ingest if file uploads are planned)

### Task 6: Fix word quota race condition

**Refs**: SEC-2
**Files**: `packages/api/src/modules/usage/service.ts`, `packages/api/src/modules/chat/index.ts`
**What**:

- In `reserveWords()`, use a serializable transaction or advisory lock to prevent concurrent reservations for the same user
- Alternative: use a single atomic SQL statement that checks AND decrements in one step (CTE with `WHERE words_used + $amount <= daily_limit`)
- Add row locking to `releaseWords()` to match `reserveWords()` behavior (DB-9)

---

## Phase 2: UX Bottlenecks

### Task 7: Fix EventSource memory leak and add polling fallback

**Refs**: UX-1
**Files**: `apps/web/src/hooks/use-asset-events.ts`
**What**:

- Stabilize the `connect` callback with proper `useCallback` deps or move connection logic into the effect body
- Clear reconnect timeouts on cleanup
- After `MAX_RECONNECT_DELAY` is exceeded N times, fall back to polling with `setInterval` (e.g. every 5 seconds)
- Clean up both EventSource and interval on unmount

### Task 8: Add optimistic updates for destructive actions

**Refs**: UX-2
**Files**: `apps/web/src/components/chat/chat-shell.tsx`
**What**:

- On `handleDeleteThread`: remove thread from state immediately, revert on error with toast
- On `handleRenameThread`: update title in state immediately, revert on error
- Disable the action button while the request is in flight to prevent double-clicks

### Task 9: Add error states and retry to asset list

**Refs**: UX-3
**Files**: `apps/web/src/components/library/asset-list.tsx`
**What**:

- Track fetch error state alongside loading state
- On failure, show an error message with a "Retry" button instead of an infinite spinner
- Show toast on network errors

### Task 10: Surface pipeline failures to the user

**Refs**: UX-4
**Files**: `packages/api/src/modules/ingest/index.ts`, `packages/api/src/modules/assets/index.ts` (SSE endpoint)
**What**:

- When `orchestratePipeline` catch fires, update the asset status to `'failed'` with the error in `lastError`
- The existing SSE `/api/assets/events` endpoint should already pick this up — verify it emits on status change to `failed`
- On the frontend, `asset-card.tsx` already shows a retry button for failed assets — verify it works end-to-end

---

## Phase 3: API Quality

### Task 11: Add pagination to all list endpoints

**Refs**: DB-2
**Files**: `packages/api/src/modules/assets/service.ts`, `threads/service.ts`, `collections/service.ts`, `podcasts/service.ts`, corresponding `index.ts` route handlers, corresponding `model.ts` schemas
**What**:

- Add `cursor` (or `offset`) and `limit` query params to list schemas (default limit: 50, max: 100)
- Update service `list()` methods to accept and use pagination params
- Return `{ items: T[], nextCursor: string | null }` instead of bare arrays
- Update frontend to handle paginated responses (can use infinite scroll or load-more button)

### Task 12: Add input validation to all API schemas

**Refs**: API-1
**Files**: All `model.ts` files in `packages/api/src/modules/*/`
**What**:

- Add `maxLength` to all string fields: `title` (200), `name` (100), `description` (1000), `sourceUrl` (2048)
- Add URL host whitelist for ingest endpoint (youtube.com, youtu.be initially)
- Add `minValue: Date.now()` or equivalent for `expiresAt` on share links
- Replace `t.Any()` in chat model with a proper TypeBox schema for UIMessage structure

### Task 13: Standardize API error responses

**Refs**: API-3
**Files**: `packages/api/src/middleware/` (new error handler), all route handlers
**What**:

- Create an Elysia `onError` handler that normalizes all errors to `{ error: string, code: string }`
- Use consistent HTTP status codes: 400 for validation, 401 for auth, 403 for authorization, 404 for not found, 429 for rate limit
- Update frontend API client to expect this shape

### Task 14: Collapse N+1 queries into JOINs

**Refs**: DB-3
**Files**: `packages/api/src/modules/assets/service.ts`, `threads/service.ts`, `shares/service.ts`
**What**:

- `AssetService.getWithTranscript()`: single query with LEFT JOIN on transcripts and transcript_segments
- `ThreadService.getWithMessages()`: single query with LEFT JOIN on qa_messages
- `ShareService.getSharedResource()`: single query joining share_links → assets → transcripts → segments

### Task 15: Wrap multi-step writes in transactions

**Refs**: DB-4
**Files**: `packages/api/src/modules/podcasts/service.ts`, `packages/api/src/modules/chat/index.ts`, `packages/api/src/modules/podcasts/episode-pipeline.ts`
**What**:

- `addFeed()`: wrap feed insert + episode inserts in `db().transaction()`
- `refreshFeed()`: wrap feed update + episode inserts in transaction
- Chat thread auto-creation: wrap thread create + word reservation in transaction
- Episode-asset linking: wrap asset create + episode link in transaction

---

## Phase 4: Frontend Quality

### Task 16: Fix AgentTab waterfall and add Suspense

**Refs**: FE-1, FE-3
**Files**: `apps/web/src/components/agent/agent-tab.tsx`, `apps/web/src/app/dashboard/page.tsx`
**What**:

- Remove `selectedId` from the `fetchAssets` effect dependency array — asset list doesn't change when selection changes
- Add `<Suspense fallback={<Skeleton />}>` around the dashboard content in `page.tsx`

### Task 17: Put search/filter state in URL params

**Refs**: FE-2
**Files**: `apps/web/src/components/library/library-tab.tsx`, `search-filter-bar.tsx`
**What**:

- Use `useSearchParams()` from Next.js to read/write `q`, `status`, and `sourceType` params
- Sync debounced search input with URL
- On mount, initialize state from URL params

### Task 18: Add code splitting for tabs

**Refs**: FE-4
**Files**: `apps/web/src/components/dashboard/dashboard-content.tsx`
**What**:

- Use `next/dynamic` with `{ ssr: false }` for `AgentTab` and `LibraryTab`
- Add loading skeletons as fallbacks

### Task 19: Use next/image for thumbnails

**Refs**: FE-5
**Files**: `apps/web/src/components/asset/asset-shell.tsx`
**What**:

- Replace `<img>` with `next/image` `<Image>` component
- Add `width`, `height`, and `alt` props
- Add YouTube thumbnail domain to `next.config.ts` `images.remotePatterns`

### Task 20: Fix keyboard navigation and accessibility

**Refs**: FE-8
**Files**: `apps/web/src/components/chat/thread-sidebar.tsx`
**What**:

- Add `e.preventDefault()` before the Space key handler to prevent page scroll
- Verify Enter key also works
- Add `aria-label` to thread action buttons

### Task 21: Add URL validation to ingest form

**Refs**: FE-6
**Files**: `apps/web/src/components/library/url-input-form.tsx`
**What**:

- Add client-side regex validation for YouTube URLs (`youtube.com/watch`, `youtu.be/`, `youtube.com/shorts/`)
- Show inline error message for invalid URLs before submitting
- Keep server-side validation as the source of truth

### Task 22: Add confirmation for collection item removal

**Refs**: FE-7
**Files**: `apps/web/src/components/collection/collection-detail.tsx`
**What**:

- Add an AlertDialog (same pattern as thread delete) before removing an item from a collection

---

## Phase 5: Infrastructure & Observability

### Task 23: Configure database connection pool

**Refs**: DB-5
**Files**: `packages/db/src/index.ts`
**What**:

- Import `Pool` from `pg` and create an explicit pool with: `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`
- Pass the pool to `drizzle()` instead of the raw connection string
- Update `closeConnections()` to call `pool.end()`

### Task 24: Add security headers to Next.js

**Refs**: INFRA-1
**Files**: `apps/web/next.config.ts`
**What**:

- Add `headers()` config with: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`
- Add a basic CSP header (start with report-only mode)

### Task 25: Add AI provider keys to env schema

**Refs**: INFRA-2
**Files**: `packages/env/src/server.ts`
**What**:

- Add `OPENAI_API_KEY: z.string().min(1)` and `GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1)` to the server env schema
- These are required for the AI features to work — fail at startup instead of at first chat request

### Task 26: Cache session per request

**Refs**: API-4
**Files**: `packages/api/src/middleware/auth.ts`
**What**:

- Memoize the `getSession()` result per request using Elysia's `store` or `derive` pattern
- The session derivation should run once per request, not once per route handler that accesses it
- Verify with Elysia docs that `derive` only runs once — if it already does, document this and close

### Task 27: Select only needed columns in list queries

**Refs**: DB-6
**Files**: `packages/api/src/modules/assets/service.ts`, `threads/service.ts`, `shares/service.ts`
**What**:

- In `list()` methods, use `.select({ id, title, status, createdAt, ... })` instead of `.select()`
- Keep `getById()` and detail methods as full selects

### Task 28: Fix publishedAt column type

**Refs**: DB-7
**Files**: `packages/db/src/schema/podcast-episodes.ts`, new migration
**What**:

- Change `publishedAt` from `text` to `timestamp`
- Generate a custom migration: `pnpm drizzle-kit generate --custom --name fix-published-at`
- Write SQL to cast existing text values to timestamps: `ALTER TABLE podcast_episodes ALTER COLUMN published_at TYPE timestamp USING published_at::timestamp`
- Run `pnpm db:migrate`

### Task 29: Use INSERT ON CONFLICT for episode upsert

**Refs**: DB-8
**Files**: `packages/api/src/modules/podcasts/service.ts`
**What**:

- Replace the fetch-all-GUIDs + filter-in-JS + insert pattern with `INSERT ... ON CONFLICT (guid) DO NOTHING`
- Drizzle supports this via `.onConflictDoNothing()`

---

## Phase 6: Minor Fixes

### Task 30: Fix remaining frontend issues

**Refs**: FE-9, FE-10, FE-11, FE-12
**Files**: `chat-shell.tsx`, `use-milkpod-chat.ts`, `transcript-viewer.tsx`, `search-filter-bar.tsx`
**What**:

- FE-9: Refactor `threadsRef` / `threadIdRef` workarounds — restructure data flow so callbacks don't need refs
- FE-10: Consolidate overlapping useEffects in TranscriptViewer
- FE-11: Derive scroll delay from CSS variable or animation duration instead of hardcoding
- FE-12: Wrap onChange callback in useCallback in parent to stabilize the reference

### Task 31: Add database constraints

**Refs**: DB-10, DB-11
**Files**: `packages/db/src/schema/usage.ts`, `collections.ts`, new migration
**What**:

- Add `CHECK (words_used >= 0)` to `dailyUsage` table
- Add unique constraint on `(userId, name)` for collections table
- Generate and run migration

### Task 32: Validate model IDs at runtime

**Refs**: API-5
**Files**: `packages/ai/src/stream.ts`, `packages/ai/src/models.ts`
**What**:

- In `resolveModel()`, check the incoming model ID against the known `MODELS` list before passing to the provider
- Return a clear error: "Unknown model: {id}. Available models: ..."

### Task 33: Fix drizzle config path

**Refs**: INFRA-3
**Files**: `packages/db/drizzle.config.ts`
**What**:

- Use `process.env.DATABASE_URL` directly if available, falling back to dotenv from the relative path
- This makes the config work in CI where env vars are injected directly

---

## Phase 7: Library API Leverage

### Task 34: Define Drizzle relations and switch to relational query API

**Refs**: DRZ-1, DB-3
**Files**: All schema files in `packages/db/src/schema/*.ts`, then `assets/service.ts`, `threads/service.ts`, `collections/service.ts`, `shares/service.ts`, `chat/service.ts`, `packages/ai/src/retrieval.ts`
**What**:

- Define `relations()` for every foreign key relationship in the schema. Key relations:
  - `mediaAssets` ↔ `transcripts` (one-to-one)
  - `transcripts` ↔ `transcriptSegments` (one-to-many)
  - `transcriptSegments` ↔ `embeddings` (one-to-one)
  - `collections` ↔ `collectionItems` (one-to-many), `collectionItems` ↔ `mediaAssets` (many-to-one)
  - `qaThreads` ↔ `qaMessages` (one-to-many), `qaMessages` ↔ `qaMessageParts` (one-to-many)
  - `qaMessages` ↔ `qaEvidence` (one-to-many)
  - `podcastFeeds` ↔ `podcastEpisodes` (one-to-many), `podcastEpisodes` ↔ `mediaAssets` (many-to-one)
  - `shareLinks` ↔ `shareQueries` (one-to-many)
- Refactor `AssetService.getWithTranscript()` to use `db.query.mediaAssets.findFirst({ with: { transcript: { with: { segments: true } } } })`
- Refactor `ThreadService.getWithMessages()` to use `db.query.qaThreads.findFirst({ with: { messages: { with: { parts: true } } } })`
- Refactor `CollectionService.getWithItems()` to use relational query with `items.asset`
- Refactor `ChatService.getMessages()` to eliminate the manual `Map.groupBy()` pattern
- Refactor `ShareService.getSharedResource()` to use nested `with` queries
- This eliminates all N+1 patterns from DB-3

### Task 35: Prepare hot-path queries

**Refs**: DRZ-2
**Files**: `packages/api/src/modules/usage/service.ts`, `packages/api/src/modules/shares/service.ts`
**What**:

- Use Drizzle's `.prepare('query_name')` on `getRemainingWords()` query — runs on every chat request
- Use `.prepare()` on `validateToken()` query — runs on every share link access
- Use placeholder syntax: `sql.placeholder('userId')` for parameterized prepared statements

### Task 36: Use Elysia `.guard()` for auth scoping

**Refs**: ELY-1
**Files**: All 8 module `index.ts` files in `packages/api/src/modules/*/`
**What**:

- In each module, wrap authenticated routes in `.guard({ auth: true }, (app) => ...)`
- Remove individual `{ auth: true }` from each route's options
- Keep public routes (share validation, health) outside the guard
- For shares module: split into guarded (create, list, delete) and unguarded (validate, public chat) sections

### Task 37: Create shared ownership resolver + standardize errors with `.onError()`

**Refs**: ELY-2, ELY-3, API-3
**Files**: `packages/api/src/middleware/` (new files), `packages/api/src/index.ts`, all module index files
**What**:

- Create `resolveOwned<T>(service: { getById(id, userId): Promise<T | null> }, id: string, userId: string): T` helper that throws a typed `NotFoundError` or `ForbiddenError`
- Create custom error classes: `NotFoundError`, `ForbiddenError`, `ValidationError`
- Add `.onError()` hook to the root Elysia app that catches these and returns `{ error: string, code: string }` with the right HTTP status
- Replace all `if (!result) return status(404, ...)` blocks with the `resolveOwned()` call
- This collapses 15+ boilerplate blocks into single-line calls

### Task 38: Replace `isAdminEmail()` with Better Auth admin plugin

**Refs**: AUTH-1
**Files**: `packages/auth/src/index.ts`, `packages/api/src/modules/usage/service.ts`, `packages/api/src/modules/chat/index.ts`, `packages/api/src/modules/usage/index.ts`, new migration for user role column
**What**:

- Add the `admin` plugin to Better Auth config: `plugins: [admin()]`
- This adds a `role` column to the user table (generate migration)
- Set initial admin users via a seed script or manual DB update
- Replace `isAdminEmail(user.email)` checks with `user.role === 'admin'`
- Remove the `ADMIN_EMAILS` env var and its schema entry
- Update `serverEnv()` to remove `ADMIN_EMAILS`

---

## TypeScript Patterns to Apply Throughout

From the codebase conventions:

| Pattern | Where to use | Reference |
|---------|-------------|-----------|
| Discriminated unions | Asset status, message part types | `@milkpod/db/schema` |
| Type predicates (`value is T`) | API response narrowing, status checks | Service layer |
| `satisfies` keyword | Config objects, tool definitions | AI package |
| Generic type constraints | Tool factory, middleware | API middleware |
