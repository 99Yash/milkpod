# Milkpod Multimodal Video Plan (Incremental)

Status: Draft  
Owner: Engineering  
Last Updated: 2026-03-09

## 0) Current State (Baseline)

- YouTube ingest currently uses captions as transcript source.
- Upload/podcast transcription already uses audio STT.
- Ask AI and Moments operate on transcript-only evidence.
- No visual context entities currently exist in DB.

## 1) Locked Technical Decisions (v1)

These decisions remove the main blockers and define v1 scope:

1. **YouTube transcription backend**
   - Resolve YouTube audio stream URL from Innertube Android player response.
   - Transcribe with existing ElevenLabs `scribe_v2` (`cloud_storage_url`).
   - Captions remain fallback only.

2. **Default transcription strategy**
   - Default to `audio-first`.
   - Keep `auto` and `captions-first` for rollout/debug controls.

3. **Visual extraction provider/model**
   - Use Gemini 2.5 Flash.
   - Use direct YouTube URL file input for visual understanding.

4. **Visual retrieval embeddings (v1)**
   - Embed visual summaries as text with existing embedding pipeline.
   - Do not introduce CLIP/multimodal embedding infra in v1.

5. **Comments architecture**
   - Dedicated comments data model and dedicated `Comments` UI surface.
   - Do not reuse/overload Moments data model in v1.

## 2) Milestone-Phase Mapping

- M1 -> Phase 1: Multilingual transcript reliability
- M2 -> Phase 2: Language-aware retrieval heuristic
- M3 -> Phase 3: Visual context extraction and indexing
- M4 -> Phase 4: Ask AI hybrid retrieval
- M5 -> Phase 5: Hybrid comments and comments UI
- M6 -> Phase 6: Upload parity (storage + multimodal processing)

## Phase 1 - Multilingual Transcript Reliability (Hindi-first) ✅

### Goal
Make YouTube ingestion robust without relying on caption availability.

### Deliverables
- ~~Extend ingest request model with transcription strategy:~~ ✅
  - `audio-first` (default)
  - `auto`
  - `captions-first`
- ~~Add YouTube audio URL resolver from Innertube `streamingData.adaptiveFormats`.~~ ✅
- ~~Add fallback chain:~~ ✅
  1. audio transcription (ElevenLabs)
  2. captions fallback
- ~~Persist transcript metadata:~~ ✅
  - method used
  - detected language
  - fallback reason (if any)

### Files
- `packages/api/src/modules/ingest/model.ts`
- `packages/api/src/modules/ingest/index.ts`
- `packages/api/src/modules/ingest/pipeline.ts`
- `packages/api/src/modules/ingest/youtube.ts`
- `packages/api/src/modules/ingest/service.ts`

### Acceptance Criteria
- Hindi YouTube video without usable captions reaches ready.
- Transcript has timestamps + detected language metadata.
- Existing caption-only English path does not regress.

## Phase 2 - Language-Aware Retrieval Heuristic ✅

### Goal
Prevent English-FTS bias for non-English transcripts while preserving English lexical quality.

### Heuristic (explicit v1)

```ts
const isEnglishTranscript = transcript.language?.toLowerCase().startsWith('en') ?? false;
const letterCount = countUnicodeLetters(query);
const latinCount = countLatinLetters(query);
const latinRatio = letterCount === 0 ? 0 : latinCount / letterCount;
const hasLexicalQuery = buildTsQuery(query).length > 0;

const useHybridLexical = isEnglishTranscript && latinRatio >= 0.6 && hasLexicalQuery;

if (useHybridLexical) {
  // rank = 0.65 lexical_norm + 0.35 semantic_norm
} else {
  // semantic-first; lexical only as supplemental append if high-confidence
}
```

### Deliverables
- ~~Implement heuristic in transcript search service.~~ ✅
- ~~Add transcript-language aware ranking metadata in search responses.~~ ✅
- ~~Update AI system prompt/tool instructions to keep answer language aligned with user/transcript language unless user explicitly requests another language.~~ ✅

### Files
- `packages/api/src/modules/assets/search-service.ts`
- `packages/ai/src/tools.ts`
- `packages/ai/src/system-prompt.ts`

### Acceptance Criteria
- Hindi queries retrieve relevant segments without relying on English FTS.
- English queries keep strong exact-term recall.
- Ask AI answers Hindi transcript questions in Hindi by default.

## Phase 3 - Visual Context Extraction and Indexing (YouTube-first) ✅

### Goal
Persist timestamped visual context suitable for retrieval.

### Deliverables
- ~~New DB entities:~~ ✅
  - `video_context_segment`
  - `video_context_embedding`
- ~~Visual extraction stage for `mediaType=video`:~~ ✅
  - Gemini 2.5 Flash over YouTube URL
  - segment output with `startTime`, `endTime`, `summary`, optional `ocrText` and `entities`, confidence
- ~~Segment constraints:~~ ✅
  - target 20-45 sec event windows
  - hard cap on segments per asset for cost control
- ~~Embedding strategy:~~ ✅
  - embed normalized text: summary + OCR + entities

### Files
- `packages/db/src/schema/video-context-segments.ts` (new)
- `packages/db/src/schema/video-context-embeddings.ts` (new)
- `packages/db/src/schemas.ts`
- `packages/api/src/modules/ingest/pipeline.ts`
- `packages/api/src/modules/ingest/service.ts`
- `packages/api/src/modules/ingest/video-context.ts` (new)
- `packages/ai/src/provider.ts`

### Acceptance Criteria
- Video assets store timestamped visual segments + embeddings.
- Visual extraction failures do not block transcript readiness.
- Stage-level telemetry is emitted.

## Phase 4 - Ask AI Hybrid Retrieval (Can Ship Independently) ✅

### Goal
Enable chat answers grounded in audio + visual evidence, independent of comments rollout.

### Deliverables
- ~~Extend retrieval tooling to fetch transcript + visual segments.~~ ✅
- ~~Add source labels and visual citations in tool responses.~~ ✅
- ~~Extend QA evidence logging for visual references.~~ ✅

### Files
- `packages/ai/src/tools.ts`
- `packages/ai/src/types.ts`
- `packages/ai/src/retrieval.ts` (or multimodal retrieval module)
- `packages/api/src/modules/chat/service.ts`
- `packages/db/src/schema/qa.ts` (if evidence schema update required)

### Acceptance Criteria
- Questions like "what is shown on screen at 12:30?" return cited answers.
- Retrieval modality (`audio`, `visual`, `hybrid`) is auditable.

## Phase 5 - Hybrid Comments + Comments UI

### Goal
Generate and present timestamped comments using fused evidence.

### Deliverables
- Comments data model (separate from moments):
  - `asset_comment`
  - evidence references + source type
- New API module:
  - `POST /api/comments/generate`
  - `GET /api/comments?assetId=...`
- Dedicated Comments UI surface with timestamp jump and source chips.

### Files
- `packages/db/src/schema/asset-comments.ts` (new)
- `packages/api/src/index.ts` (mount comments module)
- `packages/api/src/modules/comments/*` (new)
- `apps/web/src/components/asset/asset-tab-bar.tsx`
- `apps/web/src/components/comments/*` (new)
- `apps/web/src/app/asset/[id]/comments/page.tsx` (new)
- `apps/web/src/lib/data/queries.ts`

### Acceptance Criteria
- Comments are generated with timestamps and source labels.
- Users can navigate from comment to media timestamp.

## Phase 6 - Upload Video Parity (Infra + Processing)

### Goal
Bring uploaded video assets to feature parity with YouTube.

### Scope Split

#### 6A - Durable Media Storage Foundation
- Introduce durable storage for uploaded media (object storage + signed URLs).
- Persist canonical storage URL and metadata for downstream processing.

#### 6B - Multimodal Processing Parity
- Run visual extraction and visual embeddings on uploaded videos.
- Enable hybrid retrieval/comments for upload assets.

### Acceptance Criteria
- Uploaded videos support transcript + visual context + hybrid chat/comments.
- Source-type differences do not affect core user experience.

## Observability, Guardrails, and Rollout

### Feature Flags
- `ingest.youtubeAudioFirst`
- `retrieval.languageAwareHeuristic`
- `ingest.videoContext`
- `chat.hybridRetrieval`
- `comments.hybridGeneration`

### Telemetry
- Stage duration, success/failure, retries.
- Cost per minute by stage/provider/model.
- Comment engagement (save/dismiss/click-through).
- Share of non-English assets processed successfully.

### Rollout
1. Internal shadow mode for visual extraction.
2. Beta enablement for Phase 1 and Phase 2.
3. Enable Phase 4 (hybrid chat retrieval).
4. Enable Phase 5 (comments) after quality threshold.
5. Execute Phase 6 for upload parity.

## Test Plan

### Unit
- YouTube strategy selection + fallback behavior.
- Language heuristic branch selection and scoring.
- Visual segment normalization and embedding payload generation.

### Integration
- End-to-end Hindi YouTube ingest with missing captions.
- Visual extraction persistence + retrieval.
- Hybrid chat retrieval citations for audio/visual/hybrid questions.
- Comments generation API and UI rendering.

### Regression
- Existing transcript view, chat, moments, collections, and share links remain stable.

## Remaining Dependency Gates

1. Durable storage provider and retention policy for upload parity.
2. Quota and billing policy for multimodal processing.
