# Milkpod Moments Plan

## Goal

Add a new **Best Moments** section for each asset so creators can quickly extract high-value parts of long videos/podcasts.

Core principle: "best" is not universal. It should adapt to the content type and creator goal.

---

## Why this fits Milkpod (not a separate app)

This is a natural extension of the current product, not a different product:

- You already have transcript + timestamped segments (`transcript_segment`).
- You already surface timestamp interactions in UI (`TimestampLink`, `VideoMomentDialog`).
- Ask AI already exposes relevant segments in tool outputs (`retrieve_segments`).
- You already have an evidence table (`qa_evidence`) designed for segment-level support.

So we can ship "best moments" as a new layer on top of existing transcript/chat infrastructure.

---

## Product Scope (v1)

### User-facing behavior

For each asset, user can:

1. Open a new **Moments** tab
2. Choose a goal preset
3. Generate top moments with start/end timestamps and "why this matters"
4. Click any timestamp to preview in the existing moment dialog
5. Save/dismiss moments and regenerate

### Goal presets (how "best" varies)

- `hook` - strongest opening hooks / pattern interrupts
- `insight` - key lessons or conceptual takeaways
- `quote` - memorable quotable lines
- `actionable` - practical steps/how-to moments
- `story` - emotional/narrative peaks
- `default` - balanced mix

---

## Data Signals for Ranking

Use a hybrid score, not just one LLM pass.

## Signal A: Transcript salience (LLM)

LLM proposes candidate moments per chunk with:

- start time, end time
- short title
- 1-line rationale
- confidence (0-1)
- goal fit score (0-1)

## Signal B: Ask-AI evidence (already available)

Two immediate sources:

1. `qa_message_part.tool_output` for `retrieve_segments` (contains `segmentId`, timestamps, similarity)
2. `qa_evidence` table (exists in schema; should be actively populated)

This gives us "what users repeatedly ask about" = market-tested importance signal.

## Signal C: Structural heuristics

- speaker change density
- lexical novelty spikes
- cue phrases ("the key point is", "mistake", "important", "in summary")
- short burst intensity (many dense ideas in small time window)

---

## Dynamic Chunk Size (with 2000 upper bound)

For moments extraction, chunk size should scale with transcript length. Keep 2000 chars as hard max.

### Recommended chunk policy

| Transcript size (chars) | Chunk size | Overlap | Candidates/chunk |
| --- | ---: | ---: | ---: |
| <= 8,000 | 900 | 120 | 2 |
| 8,001 - 20,000 | 1,200 | 160 | 2 |
| 20,001 - 45,000 | 1,500 | 220 | 3 |
| 45,001 - 80,000 | 1,800 | 260 | 3 |
| > 80,000 | 2,000 | 300 | 4 |

### Notes

- Keep this separate from embedding chunking (`chunkTranscript`) to avoid changing retrieval behavior.
- Moments chunking should live in a dedicated module, e.g. `packages/api/src/modules/moments/chunking.ts`.

Example helper shape:

```ts
type MomentChunkConfig = {
  chunkSize: number;
  overlap: number;
  maxCandidatesPerChunk: number;
};

function getMomentChunkConfig(totalChars: number): MomentChunkConfig {
  if (totalChars <= 8000) return { chunkSize: 900, overlap: 120, maxCandidatesPerChunk: 2 };
  if (totalChars <= 20000) return { chunkSize: 1200, overlap: 160, maxCandidatesPerChunk: 2 };
  if (totalChars <= 45000) return { chunkSize: 1500, overlap: 220, maxCandidatesPerChunk: 3 };
  if (totalChars <= 80000) return { chunkSize: 1800, overlap: 260, maxCandidatesPerChunk: 3 };
  return { chunkSize: 2000, overlap: 300, maxCandidatesPerChunk: 4 };
}
```

---

## Ranking Formula (v1)

After dedupe/merge, compute final score:

`final = 0.45 * llmScore + 0.35 * qaSignal + 0.20 * structuralScore`

Where:

- `llmScore` = average of confidence + goalFit from model output
- `qaSignal` = normalized frequency/relevance from Ask-AI evidence
- `structuralScore` = deterministic heuristics score

Then apply preset-specific boosts (example):

- `hook`: boost first 20% of timeline and surprise language
- `actionable`: boost imperative/how-to cues
- `quote`: boost concise high-density lines

---

## Backend Design

## New API module

Create:

- `packages/api/src/modules/moments/index.ts`
- `packages/api/src/modules/moments/service.ts`
- `packages/api/src/modules/moments/model.ts`
- `packages/api/src/modules/moments/chunking.ts`

Mount in `packages/api/src/index.ts`.

## Suggested endpoints

- `POST /api/moments/generate`
  - body: `{ assetId, preset, regenerate? }`
  - returns generated top moments

- `GET /api/moments`
  - query: `{ assetId, preset? }`
  - returns cached/generated moments

- `POST /api/moments/:id/feedback`
  - body: `{ action: 'save' | 'dismiss' | 'upvote' | 'downvote' }`

## Generation flow

1. Validate user owns asset (`AssetService.getById`)
2. Load transcript segments
3. Compute chunk config from total transcript chars
4. Generate chunk candidates (LLM structured output)
5. Merge overlaps and map to concrete segment IDs
6. Add Ask-AI evidence score
7. Rank and keep top N
8. Persist cache and return

---

## Database Design

Add a dedicated schema file, e.g. `packages/db/src/schema/moments.ts`.

## `asset_moment`

- `id`
- `assetId` (FK -> `media_asset.id`)
- `userId` (FK -> `user.id`)
- `preset` (`default|hook|insight|quote|actionable|story`)
- `title`
- `rationale`
- `startTime`
- `endTime`
- `score` (real)
- `scoreBreakdown` (jsonb)
- `source` (`hybrid|llm|qa`)
- `isSaved` (bool)
- `dismissedAt` (nullable)
- lifecycle timestamps

Indexes:

- `(assetId, preset, score DESC)`
- `(assetId, startTime)`

## `asset_moment_feedback` (optional but useful)

- `id`
- `momentId` (FK)
- `userId` (FK)
- `action`
- lifecycle timestamps

Unique `(momentId, userId, action)` if needed.

---

## Ask-AI Evidence Integration (important)

You mentioned we already track moments in Ask AI answers. To make that robust:

### v1 (fast path)

- Parse `qa_message_part.tool_output` where tool = `retrieve_segments` and status = `found`
- Aggregate segment references per asset for `qaSignal`

### v1.1 (recommended)

- On assistant save (`ChatService.saveMessages` path), extract retrieved segment IDs
- Insert into `qa_evidence` with relevance score
- Moments ranking can then query `qa_evidence` directly (faster + cleaner)

This finally puts existing `qa_evidence` schema to active use.

---

## Frontend Plan

## Navigation and route

- Update `apps/web/src/components/asset/asset-tab-bar.tsx` to add `Moments`
- Add route: `apps/web/src/app/asset/[id]/moments/page.tsx`

## UI components

Create:

- `apps/web/src/components/moments/moments-tab.tsx`
- `apps/web/src/components/moments/moment-card.tsx`
- `apps/web/src/components/moments/moment-preset-switcher.tsx`

Each card shows:

- title
- timestamp range (`MM:SS - MM:SS`)
- rationale
- score chips (optional)
- actions: preview, copy timestamp link, save, dismiss

Preview should reuse existing timestamp action pattern (`useTimestampAction` + `VideoMomentDialog`).

---

## Performance and Cost Guardrails

- Use a cheaper model for chunk candidate extraction by default
- Process chunks in small concurrency batches (2-4)
- Cap total candidates before rerank (e.g. 80)
- Cache by `(assetId, preset, transcriptUpdatedAt)`
- Recompute only when transcript changes or user requests regenerate

---

## Rollout Phases

## Phase 1 - Read-only generated moments

- API + moments generation
- Moments tab with preview and preset switch
- No feedback persistence yet

## Phase 2 - Feedback and personalization

- save/dismiss/upvote/downvote
- adjust ranking per user over time

## Phase 3 - Repurposing bridge

- export selected moments as JSON manifest for editors
- optional clip script/caption suggestions per moment

---

## Acceptance Criteria

1. User can generate moments for any ready asset and see timestamped cards.
2. "Best" output differs by preset for the same asset.
3. Chunk size scales with transcript length and never exceeds 2000 chars.
4. Timestamp click opens playable preview via existing moment dialog.
5. Ask-AI evidence measurably affects ranking (same asset with chat history gets different ordering than fresh asset).

---

## Concrete Implementation Checklist

- [x] Add moments DB schema and migration
- [x] Add moments API module + mount in `packages/api/src/index.ts`
- [x] Implement dynamic chunk config helper (2000 upper bound)
- [x] Implement candidate generation + merge/rerank
- [ ] Integrate Ask-AI evidence scoring from `qa_message_part` (or `qa_evidence`)
- [ ] Add Moments tab route and UI cards
- [ ] Reuse timestamp preview interaction
- [ ] Add save/dismiss feedback endpoint and UI actions
- [ ] Add basic tests for chunk config and merge/ranking logic

---

## Suggested First Slice (1-week build)

If we want fastest visible win:

1. Build generation endpoint + dynamic chunking + top 10 moments
2. Add Moments tab with preview + preset switch
3. Score with transcript salience + lightweight Ask-AI signal from `qa_message_part`

This ships user-visible creator value quickly, without waiting for full shorts-rendering infrastructure.
