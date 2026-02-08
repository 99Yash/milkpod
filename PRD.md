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
`../../tutorials/total-ts/` for patterns — especially branded types,
type predicates, discriminated unions, and generic inference.

1. **Branded ID types** — Create `Brand<T, B>` utility and branded types
   (`AssetId`, `UserId`, `ThreadId`, `CollectionId`, `TranscriptId`,
   `SegmentId`, `EmbeddingId`) in `packages/db/src/helpers.ts`. Update
   `createId()` to return branded types. Update schema column types to use
   them. This prevents accidental ID mixing across tables.
   _Ref: advanced-patterns-workshop/src/01-branded-types_

2. **Shared API result types** — Create `packages/api/src/types.ts` with
   shared response shapes (`ApiResult<T>`, `ApiError`, asset/thread/collection
   response types) derived from Drizzle schema using `typeof` + `InferSelectModel`.
   Replace all inline `as Asset[]` casts on the frontend with proper types.
   _Ref: pro-essentials-workshop/src/040-deriving-types-from-values_

3. **Replace `t.Any()` validation** — In `packages/api/src/modules/chat/model.ts`,
   replace `t.Array(t.Any())` with a proper Elysia TypeBox schema matching
   `UIMessage[]` structure. Add validation for `assetId`, `collectionId`, `threadId`.
   _Ref: AI_SDK_AUDIT.md #8_

4. **Shared tool output types** — Define tool output shapes in
   `packages/ai/src/types.ts` and import on both backend (tool execute) and
   frontend (tool-result.tsx). Remove inline type assertions.
   _Ref: AI_SDK_AUDIT.md #6_

5. **Discriminated union for asset status** — Replace string `status` field
   with a proper discriminated union type that encodes valid transitions
   (`queued → fetching → transcribing → embedding → ready | failed`).
   Add a type predicate `isTerminalStatus()`.
   _Ref: pro-essentials-workshop/src/018-unions-and-narrowing_

### Phase 2: Critical Fixes (AI SDK Audit)

6. **Fix `convertToModelMessages` async** — In `packages/ai/src/stream.ts`,
   `await convertToModelMessages()` since it's async in AI SDK v6. Make
   `createChatStream` async.
   _Ref: AI_SDK_AUDIT.md #1_

7. **Wire assetId/collectionId into chat** — Inject asset context into system
   prompt dynamically AND bind `assetId` into the tool factory closure so the
   LLM doesn't need to guess which asset the user is viewing.
   _Ref: AI_SDK_AUDIT.md #2, #10_

8. **Resource authorization** — In every API endpoint that accepts `threadId`,
   `assetId`, or `collectionId`, verify that `session.user.id` owns the
   resource. Return 403 otherwise.
   _Ref: AI_SDK_AUDIT.md #5_

9. **Handle reasoning tokens** — Either render reasoning parts in
   `message.tsx` (collapsible "thinking" section) or remove
   `sendReasoning: true` from stream config to save bandwidth.
   _Ref: AI_SDK_AUDIT.md #7_

10. **Input guardrails** — Add a cheap model pre-check before main generation
    to reject inappropriate/off-topic queries. Use `generateText` with a fast
    model.
    _Ref: AI_SDK_AUDIT.md #4_

### Phase 3: Data & Persistence Improvements

11. **Normalize message persistence** — Replace JSONB `parts` column in
    `qa_messages` with a proper `qa_message_parts` table (type discriminator,
    text content, tool name, tool input/output as separate columns). Migrate
    existing data.
    _Ref: AI_SDK_AUDIT.md #3_

12. **Embedding model versioning** — Add `model` and `dimensions` columns to
    the embeddings table. Store the model name alongside each embedding so
    future model changes don't silently break similarity search.
    _Ref: AI_SDK_AUDIT.md #18_

13. **Pipeline error handling & retry** — Add exponential backoff with jitter
    to the ingestion pipeline. Track `attempts` and `lastError` in the asset
    record. Allow manual retry from the UI for failed assets.
    _Ref: ARCHITECTURE.md "Durability rules"_

### Phase 4: UX Improvements

14. **Asset detail view** — Create a dedicated asset page showing full
    transcript with timestamps, speaker labels, and the ability to jump to
    specific segments. Include the chat panel as a side panel.

15. **Collection management UI** — Build collection CRUD in the library tab:
    create collection, add/remove assets, view collection contents. Enable
    scoped Q&A across a collection.

16. **Streaming progress indicators** — Replace polling with SSE or Ably for
    pipeline status. Show real progress: "Fetching audio...",
    "Transcribing (45%)...", "Generating embeddings...".

17. **Search and filter** — Add search across assets by title, full-text
    search across transcripts, and filter by status/source type.

### Phase 5: Sharing & Access Control

18. **Share link schema & API** — Add `share_links` table (token, scope,
    expiry, can_query, revoked). API endpoints: create, revoke, validate.

19. **Share link UI** — Share button on assets/collections. Copy link dialog
    with expiry options. Read-only view for shared content.

20. **Shared Q&A** — Rate-limited ask-AI on shared links. Separate query log.
    Stricter rate limits per share token.

### Phase 6: Production Hardening

21. **Request logging** — Add structured logging middleware to Elysia. Log
    request method, path, status, duration, user ID.

22. **Rate limiting** — Per-user rate limits on ingestion, chat, and API
    calls. Token bucket pattern.

23. **Health checks & graceful shutdown** — Improve `/health` to check DB
    connectivity. Add graceful shutdown with in-flight request draining.

24. **Error boundary & offline handling** — React error boundaries around
    major sections. Handle network errors gracefully in the UI.

### Phase 7: Podcast Features (Future)

25. **Podcast feed schema** — Add tables: `podcast_feeds`, `podcast_episodes`,
    `episode_edits`, `episode_renders`, `filter_rules`.

26. **RSS ingestion** — Parse RSS feeds, create episodes, trigger transcription
    pipeline per episode.

27. **Episode filtering & EDL** — Segment labeling (ads, sports, etc.), user
    filter rules, edit decision list generation.

28. **Private RSS & Plex** — Render filtered audio, publish to private RSS
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
