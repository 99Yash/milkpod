# Milkpod — Product Requirements Document

## What Milkpod Is

AI video transcription and Q&A workspace. Users paste a YouTube link, get a
timestamped transcript with speaker labels, then ask questions and receive
answers grounded in the actual transcript with cited segments.

## What Exists Today (MVP)

Working end-to-end:

- **Auth**: Email/password + Google OAuth via Better Auth
- **Ingestion**: YouTube URL → yt-dlp metadata → ElevenLabs transcription → segment storage → pgvector embeddings
- **Q&A**: Streaming RAG chat with `retrieve_segments` and `get_transcript_context` tools via AI SDK v6
- **UI**: Dashboard with library tab (URL input, asset cards with status polling), agent tab (asset selector + chat panel), chat with tool result rendering
- **Data**: Full Drizzle schema for media_assets, transcripts, transcript_segments, embeddings, collections, qa_threads/messages/evidence

Not working / missing:

- Pipeline is fire-and-forget (no retry, no Restate)
- No realtime progress (no Ably yet)
- No podcast features (RSS, filtering, Plex)
- No share links
- No batch uploads
- Several type safety and security gaps (see AI_SDK_AUDIT.md)

## What Needs to Happen — Ordered Task List

### Phase 1: Type Safety & Foundations

These tasks tighten the TypeScript across the stack. Reference
`../../tutorials/total-ts/` for patterns — especially type predicates,
discriminated unions, and generic inference.

1. ~~**Remove branded ID types**~~ ✅ — Deleted `Brand<T, B>` and all 16 branded
   ID exports from `packages/db/src/helpers.ts`, reverted `createId()` to return
   plain `string`, removed `.$type<>()` annotations from all 9 schema files,
   removed branded ID imports/casts from 12 API module files and 4 AI package
   files. All type checks pass.

2. ~~**Type-safe environment validation**~~ ✅ — Created `@milkpod/env` package
   with Zod schemas for `serverEnv()` (DATABASE_URL, BETTER_AUTH_SECRET,
   BETTER_AUTH_URL, CORS_ORIGIN, NODE_ENV, GOOGLE_CLIENT_ID,
   GOOGLE_CLIENT_SECRET, ELEVENLABS_API_KEY) and `clientEnv()`
   (NEXT_PUBLIC_SERVER_URL). Replaced all direct `process.env` access in
   `packages/db`, `packages/auth`, `packages/api`, `apps/server`, and 5 web
   app files with typed helpers. Updated `.env.example` with all required vars.
   All type checks pass.

3. **Shared API result types** — Create `packages/api/src/types.ts` with
   shared response shapes (`ApiResult<T>`, `ApiError`, asset/thread/collection
   response types) derived from Drizzle schema using `typeof` + `InferSelectModel`.
   Replace all inline `as Asset[]` casts on the frontend with proper types.
   _Ref: pro-essentials-workshop/src/040-deriving-types-from-values_

4. **Replace `t.Any()` validation** — In `packages/api/src/modules/chat/model.ts`,
   replace `t.Array(t.Any())` with a proper Elysia TypeBox schema matching
   `UIMessage[]` structure. Add validation for `assetId`, `collectionId`, `threadId`.
   _Ref: AI_SDK_AUDIT.md #8_

5. **Shared tool output types** — Define tool output shapes in
   `packages/ai/src/types.ts` and import on both backend (tool execute) and
   frontend (tool-result.tsx). Remove inline type assertions.
   _Ref: AI_SDK_AUDIT.md #6_

6. **Discriminated union for asset status** — Replace string `status` field
   with a proper discriminated union type that encodes valid transitions
   (`queued → fetching → transcribing → embedding → ready | failed`).
   Add a type predicate `isTerminalStatus()`.
   _Ref: pro-essentials-workshop/src/018-unions-and-narrowing_

### Phase 2: Critical Fixes (AI SDK Audit)

7. **Fix `convertToModelMessages` async** — In `packages/ai/src/stream.ts`,
   `await convertToModelMessages()` since it's async in AI SDK v6. Make
   `createChatStream` async.
   _Ref: AI_SDK_AUDIT.md #1_

8. **Wire assetId/collectionId into chat** — Inject asset context into system
   prompt dynamically AND bind `assetId` into the tool factory closure so the
   LLM doesn't need to guess which asset the user is viewing.
   _Ref: AI_SDK_AUDIT.md #2, #10_

9. **Resource authorization** — In every API endpoint that accepts `threadId`,
   `assetId`, or `collectionId`, verify that `session.user.id` owns the
   resource. Return 403 otherwise.
   _Ref: AI_SDK_AUDIT.md #5_

10. **Handle reasoning tokens** — Either render reasoning parts in
    `message.tsx` (collapsible "thinking" section) or remove
    `sendReasoning: true` from stream config to save bandwidth.
    _Ref: AI_SDK_AUDIT.md #7_

11. **Input guardrails** — Add a cheap model pre-check before main generation
    to reject inappropriate/off-topic queries. Use `generateText` with a fast
    model.
    _Ref: AI_SDK_AUDIT.md #4_

### Phase 3: Data & Persistence Improvements

12. **Normalize message persistence** — Replace JSONB `parts` column in
    `qa_messages` with a proper `qa_message_parts` table (type discriminator,
    text content, tool name, tool input/output as separate columns). Migrate
    existing data.
    _Ref: AI_SDK_AUDIT.md #3_

13. **Embedding model versioning** — Add `model` and `dimensions` columns to
    the embeddings table. Store the model name alongside each embedding so
    future model changes don't silently break similarity search.
    _Ref: AI_SDK_AUDIT.md #18_

14. **Pipeline error handling & retry** — Add exponential backoff with jitter
    to the ingestion pipeline. Track `attempts` and `lastError` in the asset
    record. Allow manual retry from the UI for failed assets.
    _Ref: ARCHITECTURE.md "Durability rules"_

### Phase 4: UX Improvements

15. **Asset detail view** — Create a dedicated asset page showing full
    transcript with timestamps, speaker labels, and the ability to jump to
    specific segments. Include the chat panel as a side panel.

16. **Collection management UI** — Build collection CRUD in the library tab:
    create collection, add/remove assets, view collection contents. Enable
    scoped Q&A across a collection.

17. **Streaming progress indicators** — Replace polling with SSE or Ably for
    pipeline status. Show real progress: "Fetching audio...",
    "Transcribing (45%)...", "Generating embeddings...".

18. **Search and filter** — Add search across assets by title, full-text
    search across transcripts, and filter by status/source type.

### Phase 5: Sharing & Access Control

19. **Share link schema & API** — Add `share_links` table (token, scope,
    expiry, can_query, revoked). API endpoints: create, revoke, validate.

20. **Share link UI** — Share button on assets/collections. Copy link dialog
    with expiry options. Read-only view for shared content.

21. **Shared Q&A** — Rate-limited ask-AI on shared links. Separate query log.
    Stricter rate limits per share token.

### Phase 6: Production Hardening

22. **Request logging** — Add structured logging middleware to Elysia. Log
    request method, path, status, duration, user ID.

23. **Rate limiting** — Per-user rate limits on ingestion, chat, and API
    calls. Token bucket pattern.

24. **Health checks & graceful shutdown** — Improve `/health` to check DB
    connectivity. Add graceful shutdown with in-flight request draining.

25. **Error boundary & offline handling** — React error boundaries around
    major sections. Handle network errors gracefully in the UI.

### Phase 7: Podcast Features

26. ~~**Podcast feed schema**~~ ✅ — Added 5 tables: `podcast_feeds` (RSS metadata,
    refresh cadence), `podcast_episodes` (source URLs, status with extended
    `episode_status` enum including labeling/editing/publishing stages, linked to
    feeds and media_assets), `episode_edits` (EDL segments with keep/skip/mute
    actions), `episode_renders` (rendered audio output metadata), `filter_rules`
    (user topic preferences with skip/mute actions, optional feed scoping).
    Migration 0006.

27. **RSS ingestion** — Parse RSS feeds, create episodes, trigger transcription
    pipeline per episode.

28. **Episode filtering & EDL** — Segment labeling (ads, sports, etc.), user
    filter rules, edit decision list generation.

29. **Private RSS & Plex** — Render filtered audio, publish to private RSS
    feed, optional Plex library refresh.

## Non-Goals (for now)

- Clip export / highlight generation
- Video playback (we only work with transcripts)
- Multi-tenant / team workspaces
- Mobile app
- Self-hosted deployment guides

## Reference Materials

- `ARCHITECTURE.md` — Full system design
- `AI_SDK_AUDIT.md` — 18 issues ranked by severity
- `docs/ai-sdk.md` — RAG agent guide
- `docs/elysia.md` — Elysia framework docs
- `docs/ably.md` — Ably realtime docs
- `../../tutorials/total-ts/` — TypeScript patterns (branded types, generics,
  type predicates, discriminated unions, etc.)
