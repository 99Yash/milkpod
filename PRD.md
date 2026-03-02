# Milkpod — Codebase Audit

Comprehensive audit of code quality, performance, UX, and security.
Each finding has an ID (e.g. `DB-1`) referenced by tasks in `plan.md`.

---

## Critical — Fix Immediately

### SEC-1: Guardrails fail open on error

**File:** `packages/ai/src/guardrails.ts:52-65`
The input guardrail catches errors and returns `{ allowed: true }`. If the classification model is down or rate-limited, all user prompts — including adversarial ones — pass through to the expensive main model. Should fail closed (deny) or use a heuristic fallback.

### SEC-2: Word quota bypassable via concurrent requests

**File:** `packages/api/src/modules/chat/index.ts:20-30`
Two concurrent chat requests can both pass the `reserveWords()` check before either is counted. A user with a 200-word budget can fire 10 parallel requests with `wordLimit: 100` and consume 1000 words. The `FOR UPDATE` lock is per-transaction — it doesn't serialize across separate HTTP requests.

### SEC-3: No timeout on AI streaming requests

**File:** `packages/ai/src/stream.ts:130-150`
`streamText()` has no `AbortSignal` or timeout. If the provider API hangs, the HTTP connection stays open indefinitely, tying up server resources and leaving the user staring at a spinner forever.

### SEC-4: Rate limiter uses IP only — broken behind proxies

**File:** `packages/api/src/middleware/rate-limit.ts:104-110`
Rate limiting is per-IP. Behind CloudFlare/AWS ALB, all users from the same proxy share a single bucket. A single VPN exit node could exhaust limits for every user behind it. Should use authenticated `userId` as the primary key, falling back to IP for unauthenticated routes.

---

## High — Significant UX / Performance Impact

### DB-1: Missing indexes on 6 tables

Queries touching these columns do full table scans:

| Table | Missing Index | Used In |
|-------|--------------|---------|
| `collection_items` | `collectionId` | `CollectionService.getWithItems()` |
| `collection_items` | `assetId` | `ShareService.getSharedResource()` |
| `qa_evidence` | `messageId` | cascade deletes, evidence lookups |
| `qa_evidence` | `segmentId` | cascade deletes |
| `share_queries` | `(shareLinkId, createdAt)` | rate-limit window query |
| `media_assets` | `(userId, status)` compound | `AssetService.list()` filters by both |
| `transcript_segments` | `(transcriptId, segmentIndex)` compound | retrieval sampling with modulo |

**Impact:** Every list/detail/delete operation on these tables is O(n) instead of O(log n).

### DB-2: No pagination on any list endpoint

**Files:** `AssetService.list()`, `ThreadService.list()`, `CollectionService.list()`, `PodcastService.listFeeds()`, `PodcastService.listEpisodes()`
All return unbounded result sets. A user with 5000 assets loads the entire set into memory on every dashboard visit.

### DB-3: N+1 query patterns in detail views

| Service Method | Queries | Could Be |
|---------------|---------|----------|
| `AssetService.getWithTranscript()` | 3 sequential (asset, transcript, segments) | 1 JOIN |
| `ThreadService.getWithMessages()` | 2 sequential (thread, messages) | 1 JOIN |
| `ShareService.getSharedResource()` | 3-4 sequential | 1-2 JOINs |

**Impact:** Asset detail page fires 3 DB round-trips. At 5ms each that's 15ms vs 5ms — adds up under load.

### DB-4: Missing transaction boundaries

| Operation | File | Risk |
|-----------|------|------|
| Feed + episodes insert | `podcasts/service.ts:17-44` | Feed created, episode insert fails → orphan feed |
| Thread creation + chat | `chat/index.ts:59-69` | Words reserved, thread create fails → leaked quota |
| Episode-asset linking | `podcasts/episode-pipeline.ts:74-97` | Asset created, link fails → orphan asset |

### DB-5: No connection pool configuration

**File:** `packages/db/src/index.ts:10`
`drizzle(process.env.DATABASE_URL)` uses driver defaults. No explicit `max` pool size, no idle timeout, no connection lifetime. Under production load this will either exhaust connections or create too few.

### UX-1: EventSource memory leak and no polling fallback

**File:** `apps/web/src/hooks/use-asset-events.ts:25-77`
The `connect` callback is recreated on renders, opening multiple SSE connections. `setTimeout` for reconnection isn't cleaned up if the component unmounts mid-reconnect. If SSE fails permanently after `MAX_RECONNECT_DELAY`, there's no fallback to polling — assets stick in "processing" until the user refreshes.

### UX-2: No optimistic updates on destructive actions

**File:** `apps/web/src/components/chat/chat-shell.tsx:69-89`
Thread deletion waits for the server response before removing from the list. On slow connections the UI feels frozen. Same for collection item removal and thread rename.

### UX-3: Missing loading/error states in asset list

**File:** `apps/web/src/components/library/asset-list.tsx:29-42`
When `loadAssets()` fails, the error is silently caught. User sees an infinite spinner with no way to retry or understand what happened.

### UX-4: No error recovery for fire-and-forget pipelines

**Files:** `packages/api/src/modules/ingest/index.ts:48-51`, `chat/index.ts:84-89`
Ingestion pipeline and title generation are fire-and-forget with `.catch(console.error)`. If the pipeline fails after the 200 response, the user is never notified — the asset just stays in a processing state forever.

### API-1: Missing input validation / length limits

**Files:** All `model.ts` files in `packages/api/src/modules/*/`
- `title`, `description`, `name` fields have no `maxLength`
- `sourceUrl` has format validation but no host whitelist (potential SSRF)
- `expiresAt` is optional with no "must be in the future" check
- Chat messages use `t.Any()` for the message array — zero validation

### API-2: No request body size limit

**File:** `apps/server/src/index.ts`
Elysia server has no `bodyLimit` configured. A malicious client can POST a 1GB JSON payload.

### API-3: Inconsistent error response format

Some endpoints return `{ message: string }`, others return `{ error: string }`, others return plain strings. The frontend has to handle multiple shapes.

---

## Medium — Code Quality / Maintainability

### DB-6: Over-fetching on list queries

**Files:** `AssetService.list()`, `ThreadService.list()`, `ShareService.list()`
All use `.select()` (all columns). List views only need `id, title, status, createdAt` — the full row includes `lastError`, `rawMetadata`, and other heavy fields.

### DB-7: `publishedAt` is text instead of timestamp

**File:** `packages/db/src/schema/podcast-episodes.ts:33`
Stored as `text` — can't sort or filter by date at the DB level without casting.

### DB-8: Episode upsert is fetch-then-insert

**File:** `packages/api/src/modules/podcasts/service.ts:139-165`
Fetches all existing GUIDs into memory, filters in JS, then inserts. Should use `INSERT ... ON CONFLICT DO NOTHING`.

### DB-9: `releaseWords()` has no row locking

**File:** `packages/api/src/modules/usage/service.ts:74-84`
`reserveWords()` correctly uses `FOR UPDATE`, but `releaseWords()` doesn't. Concurrent release operations can lose updates.

### FE-1: Waterfall in AgentTab

**File:** `apps/web/src/components/agent/agent-tab.tsx:26-37`
Every time the user selects a different asset, `fetchAssets()` re-fires (refetches the entire asset list just because `selectedId` changed in the dependency array).

### FE-2: Search/filter state not in URL

**File:** `apps/web/src/components/library/library-tab.tsx:26-28`
Filters live in component state only. Refresh loses them. Can't share a filtered view.

### FE-3: Missing Suspense boundaries

**File:** `apps/web/src/app/dashboard/page.tsx`
No `<Suspense>` around the initial data fetch. Page waits for both assets and collections to resolve before rendering anything.

### FE-4: No code splitting for tabs

**File:** `apps/web/src/components/layouts/providers.tsx`
LibraryTab and AgentTab are eagerly loaded even if the user never opens them. Should use `React.lazy()` or `next/dynamic`.

### FE-5: Native `<img>` instead of `next/image`

**File:** `apps/web/src/components/asset/asset-shell.tsx:105-110`
Thumbnail uses `<img>` — no lazy loading, no responsive sizing, no WebP/AVIF optimization.

### FE-6: URL form validation is client-side only and too permissive

**File:** `apps/web/src/components/library/url-input-form.tsx:14-65`
Only checks if the URL is empty. No YouTube/podcast URL pattern validation — invalid URLs are accepted and fail silently on the server.

### FE-7: No confirmation dialog for collection item removal

**File:** `apps/web/src/components/collection/collection-detail.tsx:68-81`
Thread deletion has a confirmation dialog; collection item removal doesn't. Inconsistent UX.

### FE-8: Keyboard navigation incomplete

**File:** `apps/web/src/components/chat/thread-sidebar.tsx:180-189`
Thread items have `role="button"` and handle Space key, but don't call `e.preventDefault()` — pressing Space scrolls the page.

### FE-9: Stale closure workarounds

**Files:** `chat-shell.tsx:37-38` (threadsRef), `use-milkpod-chat.ts:31-36` (threadIdRef)
Multiple ref-based workarounds for stale closures. Indicates the data flow could be restructured.

### API-4: Session re-derived on every request with no caching

**File:** `packages/api/src/middleware/auth.ts:4-13`
`auth().api.getSession()` hits the database on every single request. No per-request memoization or short-lived cache.

### API-5: AI model ID not validated at runtime

**File:** `packages/ai/src/stream.ts:21-34`
`resolveModel()` accepts any string. `openai:fake-model-xyz` won't error until the provider API call, wasting a request cycle.

### API-6: Streaming response headers set after stream starts

**File:** `packages/api/src/modules/chat/index.ts:122-127`
`X-Words-Remaining` and `X-Is-Admin` headers are set after `createChatStream()`. Depending on when Elysia flushes, these may be lost.

### INFRA-1: Missing security headers in Next.js

**File:** `apps/web/next.config.ts`
No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy` headers configured.

### INFRA-2: AI provider keys not in env schema

**File:** `packages/env/src/server.ts`
`OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are read directly by the AI SDK providers, bypassing the `serverEnv()` validation layer. A missing key silently fails at runtime instead of at startup.

### INFRA-3: Drizzle config uses hardcoded relative path

**File:** `packages/db/drizzle.config.ts:5`
`path: "../../apps/server/.env"` — breaks in CI or if the monorepo structure changes.

---

## Library API Gaps — Underutilized Built-in Features

### DRZ-1: No Drizzle relations defined — forces manual JOINs everywhere

**Files:** All schema files in `packages/db/src/schema/*.ts`
Zero `relations()` calls exist in any schema file. Every nested data fetch uses manual `.innerJoin()` / `.leftJoin()` or sequential queries. Drizzle's relational query API (`db.query.table.findMany({ with: { relation: true } })`) auto-generates JOINs from relation definitions and returns properly typed nested objects — eliminating DB-3 (N+1 patterns) entirely.

**Impact:** Resolves DB-3. Also eliminates the manual `Map.groupBy()` in `chat/service.ts:123-150` where messages + parts are fetched separately and grouped in JS.

### DRZ-2: Missing `.prepare()` on hot-path queries

**Files:** `packages/api/src/modules/usage/service.ts:20-29`, `packages/api/src/modules/shares/service.ts:69-88`
`getRemainingWords()` runs on every chat request. `validateToken()` runs on every public share access. Neither is a prepared statement. Drizzle's `.prepare()` caches the query plan, reducing per-call overhead on frequently-executed queries.

### ELY-1: 48+ routes repeat `{ auth: true }` — should use `.guard()` scoping

**Files:** All 8 module `index.ts` files in `packages/api/src/modules/*/`
Every route individually specifies `{ auth: true }`. Elysia's `.guard()` can scope auth to a group of routes, reducing boilerplate and making it impossible to accidentally forget auth on a new route:
```typescript
.guard({ auth: true }, (app) =>
  app.get('/', handler).post('/', handler) // all auth'd
)
```

### ELY-2: Ownership validation boilerplate repeated across 4+ modules

**Files:** `assets/index.ts`, `collections/index.ts`, `threads/index.ts`, `shares/index.ts`
Every module repeats the same pattern: `getById(id, userId) → if (!result) return status(404/403)`. This is 15+ identical blocks. A generic Elysia plugin factory could generate CRUD routes from a service + model config, or a shared `resolveOwned(service, id, userId)` helper could eliminate the duplication.

### ELY-3: Inconsistent error shapes — no `.onError()` hook

**Files:** `packages/api/src/index.ts`, all module index files
Error responses use `status(4xx, { message: '...' })` in some places and `{ error: '...' }` in others. Elysia's `.onError()` lifecycle hook can normalize all errors to a single shape. Combined with custom error classes, this eliminates the manual `status()` calls scattered across 50+ locations.

### AUTH-1: Manual `isAdminEmail()` string parsing instead of Better Auth admin plugin

**Files:** `packages/api/src/modules/usage/service.ts:12-17`, `chat/index.ts:9,17,23,109,122`
Admin checks parse a comma-separated env var and do string comparison. Better Auth has an `admin` plugin that adds a `role` column to the user table and provides RBAC — proper role checks instead of email matching, plus ban/unban and impersonation features for free.

---

## Low — Nice to Have

### FE-10: Multiple useEffects with overlapping concerns in TranscriptViewer

**File:** `apps/web/src/components/asset/transcript-viewer.tsx`
6 separate effects manage search, scroll, and view mode. Could be consolidated.

### FE-11: Hardcoded scroll delay constant

**File:** `apps/web/src/components/asset/transcript-viewer.tsx:18`
`SCROLL_TO_MATCH_DELAY_MS = 160` is coupled to accordion animation speed.

### FE-12: onChange in useEffect dependency causes extra debounce timers

**File:** `apps/web/src/components/library/search-filter-bar.tsx:30-40`
Callback reference changes on every parent render → extra timers created.

### DB-10: No CHECK constraint on `wordsUsed`

**File:** `packages/db/src/schema/usage.ts:18-20`
`wordsUsed` can theoretically go negative if application logic has a bug. A `CHECK (words_used >= 0)` constraint would catch this.

### DB-11: No uniqueness constraint on collection names per user

**File:** `packages/db/src/schema/collections.ts:6-15`
Users can create multiple collections with the same name.

---

## Reference Materials

- `ARCHITECTURE.md` — System design
- `AI_SDK_AUDIT.md` — 18 AI SDK issues ranked by severity
- `docs/ai-sdk.md` — RAG agent guide
- `docs/elysia.md` — Elysia framework docs
