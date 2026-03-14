# Milkpod Multimodal Video Understanding PRD

Status: Draft  
Owner: Milkpod  
Last Updated: 2026-03-09

## 1) Context

Milkpod currently extracts insight from transcript text only.
For many videos, especially non-English and mixed-language content, relying on captions alone is not reliable enough.

Today:
- YouTube ingest is caption-track based.
- Upload/podcast ingest is audio-transcription based.
- Chat, moments, and search are transcript-only.

## 2) Problem Statement

Users want robust understanding of videos, not just audio/captions:
- Captions can be missing, low quality, delayed, or wrong for Hindi and other languages.
- Important context is visual (slides, diagrams, code on screen, demos, gestures).
- AI comments/highlights should combine what is spoken and what is visible.

## 3) Vision

Milkpod should become a multimodal video intelligence system:
1. Always produce a usable transcript (even without captions, across languages).
2. Extract timestamped visual context from the video itself.
3. Generate high-quality AI comments and highlights from combined audio and visual evidence.
4. Keep responses grounded with timestamps and clear evidence source labels.

## 4) Product Goals

### G1 - Multilingual Reliability
- Support Hindi and other non-English content without requiring caption availability.
- Detect language automatically and preserve transcript quality.

### G2 - Visual Understanding
- Capture scene-level context (what appears on screen) with timestamps.

### G3 - Hybrid AI Output
- Let Ask AI and comment generation cite evidence from audio, visual, or both.

### G4 - Explainable Output
- Every generated insight/comment includes timestamped citations and evidence source.

## 5) V1 Decisions (Locked)

The following are now explicit product/engineering decisions for v1:

1. **YouTube audio backend (Phase 1):**
   - Use YouTube Innertube Android player response to resolve an audio stream URL.
   - Transcribe that URL with AssemblyAI STT with speaker diarization enabled.
   - Captions are fallback only, not primary.

2. **Transcription strategy default:**
   - Default ingest strategy is `audio-first`.
   - `auto` and `captions-first` remain supported for controlled rollouts/debugging.

3. **Visual model/provider (Phase 3):**
   - Use Gemini 2.5 Flash with direct YouTube URL file input for visual context extraction.
   - Start with coarse timeline events (not frame-level detection).

4. **Visual segment granularity:**
   - Target 20-45 second segments.
   - Cap to a bounded number of segments per asset to control cost.

5. **Visual embedding strategy (v1):**
   - Embed text summaries of visual segments using existing text embeddings pipeline.
   - No CLIP/native multimodal embedding model in v1.

6. **Comments vs Moments product surface:**
   - Use a dedicated `Comments` surface and dedicated comments data model.
   - Do not overload existing Moments presets in v1.

## 6) Scope by Milestone

### M1: Caption-Independent Multilingual Transcript (Hindi-first)
- YouTube ingestion uses audio-based transcription as primary path.
- Captions remain fallback.
- Transcript metadata stores transcription method and detected language.

### M2: Language-Aware Retrieval Heuristic
- Retrieval switches strategy based on transcript/query language signals.
- Non-English flows are semantic-first by default.

### M3: Video Context Extraction and Indexing (YouTube-first)
- Generate timestamped visual context segments from video.
- Persist visual segments and text embeddings.

### M4: Ask AI Hybrid Retrieval
- Chat retrieval includes visual context alongside transcript segments.
- Answers cite both modalities when relevant.

### M5: Hybrid Comments and UI
- Generate comments from fused transcript and visual context.
- Expose comments in dedicated UI with timestamp and source labels.

### M6: Upload Video Parity
- Add durable upload media path.
- Apply same multimodal pipeline to uploaded videos.

## 7) Functional Requirements

### FR1 - Ingestion Strategy
- Support ingestion transcription modes:
  - `audio-first` (default)
  - `auto`
  - `captions-first`
- For YouTube:
  - Prefer audio transcription for multilingual robustness.
  - Use captions only as fallback.

### FR2 - Transcript Metadata
- Store:
  - detected language
  - transcription method (`audio`, `captions`, `audio_fallback_to_captions`)
  - provider metadata needed for diagnostics

### FR3 - Language-Aware Retrieval Heuristic
- Retrieval strategy is explicit:
  - If transcript language is English-like and query is mostly Latin text: run hybrid lexical + semantic ranking.
  - Otherwise: run semantic-first and use lexical only as optional supplemental signal.
- Initial v1 scoring:
  - English-like hybrid: `0.65 * lexical_norm + 0.35 * semantic_norm`
  - Non-English/default: semantic ranking primary; lexical appended only when high-confidence matches exist.

### FR4 - Visual Context Segmentation
- For video assets, extract timestamped visual entries:
  - `startTime`, `endTime`
  - `summary`
  - `ocrText` (optional)
  - `entities` (optional)
  - confidence and provider metadata

### FR5 - Visual Embedding
- Build embedding text from visual summary + OCR + entities.
- Use existing text embedding model and storage/indexing workflow.

### FR6 - Hybrid Ask AI Retrieval
- Ask AI retrieval can return transcript segments, visual segments, or mixed sets.
- Returned evidence includes source labels (`audio`, `visual`, `hybrid`) and timestamp references.

### FR7 - Hybrid Comment Generation
- Generate timestamped comments from fused evidence.
- Store evidence references for explainability and reranking.

### FR8 - UI Surface
- Add dedicated comments surface in asset experience.
- Each comment shows:
  - timestamp range
  - source label (`audio` | `visual` | `hybrid`)
  - rationale text

### FR9 - Failure Handling
- Visual extraction failure must not block transcript readiness.
- Asset can be transcript-ready while visual status is degraded/pending.

## 8) Non-Functional Requirements

- Reliable processing for long-form videos.
- Bounded cost per asset (configurable limits).
- Bounded latency with stage progress updates.
- Robust retries and partial-failure tolerance.
- Observability by stage and provider.

## 9) Success Metrics

### Reliability
- Percentage of non-English assets that reach transcript ready without captions.
- Percentage of assets with successful visual context extraction.

### Quality
- User rating/save rate for AI comments.
- Reduction in "not enough context" answers for visual questions.

### Performance
- p50/p95 ingest duration by duration bucket.
- p50/p95 visual extraction and comment generation duration.

### Cost
- Cost per processed video minute by stage.
- Cost per generated comment set.

## 10) Risks and Mitigations

- Higher cost/latency:
  - Mitigate with segment caps, model tiering, and feature flags.
- YouTube audio URL resolution edge cases:
  - Mitigate with retry + captions fallback + explicit method telemetry.
- OCR/visual noise:
  - Mitigate with confidence filtering and dedupe heuristics.
- UX confusion on evidence origin:
  - Mitigate with explicit source labels and citations.

## 11) Rollout Strategy

- Feature flags per stage:
  - multilingual audio-first ingest
  - language-aware retrieval heuristic
  - visual context extraction
  - hybrid chat retrieval
  - hybrid comments
- Start with YouTube assets.
- Run visual extraction in shadow mode before broad user exposure.
- Expand to uploads after durable storage is shipped.

## 12) Remaining Open Decisions

- Durable media storage implementation for upload parity (provider and retention policy).
- Tenant-level quota policy for multimodal processing.
