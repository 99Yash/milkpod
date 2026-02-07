# Architecture

This document captures the current architecture and product decisions for the
Milkpod transcription and Q&A workspace.

## Goals
- Link-first ingestion for YouTube, podcasts, and external links on day one.
- Real-time, streaming UX for tool calls, progress, and answers.
- Durable workflows that resume after timeouts and retries.
- Evidence-gated Q&A that only answers with cited transcript segments.
- Personalized podcast filtering with private RSS and Plex support.
- Read-only sharing with ask-AI under stricter rate limits.
- No raw media storage for link sources unless the user explicitly uploads media.

## Core Decisions
- Frontend: Next.js App Router in `apps/web`.
- Backend: Elysia in `apps/server` with Eden for typed API.
- Auth: Better Auth.
- Data: Postgres + Drizzle, `pgvector` for embeddings.
- Transcription: ElevenLabs.
- Workflows: Restate.dev for durable, resumable jobs.
- Streaming: Vercel AI SDK for LLM responses with SSE.
- Realtime: Ably for workflow and batch progress, optional AI Transport for tool
  call streaming and citations.
- No clip export; no raw link-based media storage. Edited podcast renders may be
  stored for private RSS and Plex playback.

## System Components
- `apps/web`: App Router UI, server components for data, leaf client components
  for realtime subscriptions.
- `apps/server`: Elysia API, Restate clients, transcription and ingestion
  workers.
- `packages/api`: Elysia routes and Eden types.
- `packages/auth`: Better Auth integration.
- `packages/db`: Drizzle schema, migrations, and data helpers.

## Ingestion Flows

### Link ingestion (YouTube, podcasts, external)
1. Normalize URL and store metadata (source type, title, channel, duration).
2. Fetch audio to temporary storage for processing only.
3. Transcribe with ElevenLabs (async job if supported; otherwise chunked sync).
4. Persist transcript segments and embeddings.
5. Delete temporary audio artifacts.

No link-based media is stored long-term. We only keep derived artifacts.

### Explicit uploads
- Uploaded files may be stored in object storage for reprocessing, but remain
  user-scoped and are never publicly exposed.
- Videos are converted to audio for transcription; the derived transcript and
  embeddings are the primary artifacts.

### Podcast personalization (filtered RSS + Plex)
1. Ingest RSS feed or episode link and store feed/episode metadata.
2. Fetch episode audio to temporary storage.
3. Transcribe and segment, then label segments (ads, sports, etc.).
4. Apply user rules and generate an edit decision list (EDL).
5. Render filtered audio (keep/skip/mute) and store only the edited output.
6. Publish to private RSS and optionally refresh Plex libraries.
7. Delete raw audio artifacts.

## Durable Workflow Design (Restate)

Each asset runs as a durable workflow with explicit state and idempotency.

State machine:

```
queued -> fetching -> transcribing -> embedding -> ready
                                -> failed
```

Durability rules:
- Idempotency key per source (normalized URL + duration + source ID).
- Every step stores `attempts`, `last_error`, `provider_job_id`, and timestamps.
- Chunk audio to keep per-request duration bounded (example: 2-5 minute chunks).
- Resume from the last completed chunk on retry.
- Exponential backoff with jitter; failed jobs land in a retryable state.
- Podcast workflows add `labeling`, `editing`, and `publishing` steps before
  `ready`.

## Realtime and Streaming UX

### LLM streaming
- Vercel AI SDK streams tokens over SSE from the chat endpoint.
- Responses stream whenever possible; long operations show tool-call events.

### Workflow progress
- Ably channels publish workflow events and batch progress.
- Client uses a small `use client` subscriber component to update local state.
- Episode rendering streams `labeling`, `editing`, and `publishing` steps.

### Optional Ably AI Transport
- If we unify tool-call streaming, use Ably AI Transport with
  message-per-response to reduce overhead.
- Tool call inputs and outputs are streamed as events with citations.

### Event contract (baseline)

```
{
  "type": "workflow.step.completed",
  "assetId": "asset_123",
  "batchId": "batch_456",
  "step": "transcribing",
  "attempt": 2,
  "timestamp": "2026-02-07T12:34:56Z"
}

{
  "type": "tool.call.started",
  "requestId": "qa_789",
  "tool": "retrieve_segments",
  "input": { "query": "..." }
}

{
  "type": "llm.delta",
  "requestId": "qa_789",
  "delta": "partial text"
}
```

## Collections and Query Scopes
- Every asset has `source_type` (yt, podcast, upload, external) and
  `media_type` (audio, video).
- Users can create collections and add multiple assets.
- Q&A can target a single asset or a collection scope.
- Podcast feeds can map to collections for scoped Q&A and filtering rules.

## Sharing and Read-only Q&A
- Share links are tokenized and scoped to an asset or collection.
- Shared views are read-only: no edits, no rule changes, no metadata updates.
- Ask-AI is available with stricter rate limits per share token.
- Share-session questions are not appended to the owner's Q&A threads.
- Links can be revoked and optionally expire.

## Data Model (conceptual)
- `media_assets`: source metadata, status, duration, source type.
- `transcripts`: transcript metadata and provider info.
- `transcript_segments`: text + timestamps + speaker + embedding reference.
- `embeddings`: vector storage (pgvector).
- `collections`, `collection_items`: user-defined scopes.
- `qa_threads`, `qa_messages`, `qa_evidence`: questions, answers, citations.
- `batches`: bulk uploads and link ingestion batches.
- `podcast_feeds`: RSS metadata and refresh cadence.
- `podcast_episodes`: source URLs, publish dates, durations, and status.
- `episode_edits`: EDL segments with keep/skip/mute actions and reasons.
- `episode_renders`: edited audio output metadata and storage keys.
- `filter_rules`: user topic preferences and exclusion rules.
- `share_links`: token, scope, expiry, revoke metadata, and `can_query`.
- `share_queries` (optional): audit/log of share-session questions.

## Bulk Processing and Rate Limits
- Batches aggregate many assets; each asset reports step status and retries.
- Token bucket per provider plus global concurrency cap.
- Queue position and ETA are displayed in the UI.
- Backpressure is visible ("waiting for capacity" vs "stuck").
- Share links have tighter per-token rate limits and lower concurrency caps.

## Safety and Abuse Resistance
- Treat transcript content as untrusted data, never instructions.
- Evidence-gated answers only; respond "I don't know" when citations are
  insufficient.
- Strict tool surface area; no privileged actions exposed to the model.
- Limits: max duration, max file size, max question length, per-user rate limits.
- Abuse monitoring: retry counts, error spikes, and anomalous usage alerts.

## Performance and Scale
- Separate worker pool for audio fetch, transcription, and embeddings.
- Chunked transcription and batched embeddings to avoid long requests.
- pgvector for early scale; migrate to Qdrant/Pinecone/Weaviate if needed.
- Client caching (SWR or React Query) for instant UI updates.
- Prefetch and optimistic UI where safe.
- Audio editing and rendering are CPU-heavy; isolate FFmpeg workers and throttle
  concurrent renders.

## Theming and Dark Mode
- `next-themes` drives class-based theming using shadcn CSS variables.
- Default theme is `system` with `enableSystem` so UI follows OS changes.
- `color-scheme` is set for light and dark to keep native controls aligned.

## Observability
- Record per-step durations, retries, and provider latency.
- Track queue depth, concurrency utilization, and failure rates.
- Store workflow and AI events for audit and debugging.
- Track episode edit outcomes (percent removed, reasons, and render times).
