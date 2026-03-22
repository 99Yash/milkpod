import { generateText, Output } from 'ai';
import { z } from 'zod';
import { fastModel } from '@milkpod/ai/provider';
import { db } from '@milkpod/db';
import { qaEvidence, transcriptSegments, transcripts } from '@milkpod/db/schemas';
import { eq, sql } from 'drizzle-orm';
import { AssetService } from '../assets/service';
import { MomentService } from './service';
import { formatTime } from '../../utils';
import {
  getMomentChunkConfig,
  chunkSegmentsForMoments,
  type MomentChunk,
} from './chunking';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PresetId = 'default' | 'hook' | 'insight' | 'quote' | 'actionable' | 'story';

/** Raw candidate from LLM extraction */
export interface LLMCandidate {
  title: string;
  rationale: string;
  startTime: number;
  endTime: number;
  confidence: number;
  goalFit: number;
}

/** Candidate enriched with all scoring signals */
export interface ScoredCandidate {
  title: string;
  rationale: string;
  startTime: number;
  endTime: number;
  llmScore: number;
  qaSignal: number;
  structuralScore: number;
  finalScore: number;
}

// ---------------------------------------------------------------------------
// Zod schema for structured LLM output
// ---------------------------------------------------------------------------

const momentCandidateSchema = z.object({
  title: z.string().describe('Short descriptive title for this moment'),
  rationale: z.string().describe('One sentence explaining why this moment is valuable'),
  startTime: z.number().describe('Start time in seconds within the chunk window'),
  endTime: z.number().describe('End time in seconds within the chunk window'),
  confidence: z.number().min(0).max(1).describe('How confident this is a high-value moment (0-1)'),
  goalFit: z.number().min(0).max(1).describe('How well this fits the extraction goal (0-1)'),
});

// ---------------------------------------------------------------------------
// Preset system prompts
// ---------------------------------------------------------------------------

const PRESET_INSTRUCTIONS: Record<PresetId, string> = {
  default:
    'Find the most compelling, high-value moments — a balanced mix of insights, hooks, quotable lines, and actionable advice.',
  hook:
    'Find the strongest opening hooks, pattern interrupts, and attention-grabbing statements. Prioritize moments that would make someone stop scrolling.',
  insight:
    'Find the key lessons, conceptual takeaways, and "aha" moments. Prioritize deep understanding and novel ideas.',
  quote:
    'Find the most memorable, quotable, and shareable lines. Prioritize concise, powerful statements that stand alone.',
  actionable:
    'Find the most practical steps, how-to moments, and concrete advice. Prioritize things the viewer can immediately act on.',
  story:
    'Find emotional peaks, narrative climaxes, and storytelling moments. Prioritize vulnerability, humor, and dramatic tension.',
};

function buildExtractionPrompt(preset: PresetId, maxCandidates: number): string {
  return `You are a moment extractor for video/podcast transcripts. Your task is to identify the ${maxCandidates} best moments from the transcript chunk below.

Goal: ${PRESET_INSTRUCTIONS[preset]}

Rules:
- Each moment must have a start and end time (in seconds) that falls within the chunk's time window.
- Keep titles short (3-8 words).
- Rationale should be one sentence explaining the value.
- confidence: how objectively strong this moment is (0-1).
- goalFit: how well it matches the specific extraction goal above (0-1).
- Return up to ${maxCandidates} candidates. Return fewer if the chunk lacks good material.
- Prefer moments that are 10-60 seconds long. Avoid very short (<5s) or very long (>90s) clips.`;
}

// ---------------------------------------------------------------------------
// Step 1: LLM candidate extraction per chunk
// ---------------------------------------------------------------------------

async function extractCandidatesFromChunk(
  chunk: MomentChunk,
  preset: PresetId,
  maxCandidates: number,
): Promise<LLMCandidate[]> {
  const prompt = `Transcript chunk (${formatTime(chunk.startTime)} - ${formatTime(chunk.endTime)}):\n\n${chunk.text}`;

  const result = await generateText({
    model: fastModel,
    system: buildExtractionPrompt(preset, maxCandidates),
    prompt,
    output: Output.array({
      element: momentCandidateSchema,
      name: 'moment_candidates',
      description: `Up to ${maxCandidates} best moment candidates from this chunk`,
    }),
    maxOutputTokens: 1024,
    timeout: { totalMs: 60_000 },
  });

  const candidates = result.output ?? [];

  const MIN_DURATION = 5; // seconds, consistent with prompt rules

  // Clamp times to chunk boundaries, normalize, and filter invalid windows
  return candidates
    .map((c) => {
      let start = Math.max(chunk.startTime, c.startTime);
      let end = Math.min(chunk.endTime, c.endTime);
      // Swap if LLM returned startTime > endTime
      if (start > end) [start, end] = [end, start];
      return {
        ...c,
        startTime: start,
        endTime: end,
        confidence: clamp01(c.confidence),
        goalFit: clamp01(c.goalFit),
      };
    })
    .filter((c) => c.endTime - c.startTime >= MIN_DURATION);
}

/** Process all chunks with bounded concurrency */
async function extractAllCandidates(
  chunks: MomentChunk[],
  preset: PresetId,
  maxCandidatesPerChunk: number,
  concurrency = 3,
): Promise<LLMCandidate[]> {
  const results: LLMCandidate[] = [];

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((chunk) => extractCandidatesFromChunk(chunk, preset, maxCandidatesPerChunk)),
    );
    for (const r of batchResults) results.push(...r);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Step 2: Merge overlapping candidates
// ---------------------------------------------------------------------------

/** Merge candidates whose time windows overlap by more than 50% */
export function mergeOverlapping(candidates: LLMCandidate[]): LLMCandidate[] {
  if (candidates.length === 0) return [];

  // Sort by start time
  const sorted = [...candidates].sort((a, b) => a.startTime - b.startTime);
  const merged: LLMCandidate[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    const overlapStart = Math.max(last.startTime, current.startTime);
    const overlapEnd = Math.min(last.endTime, current.endTime);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
    const minDuration = Math.min(
      last.endTime - last.startTime,
      current.endTime - current.startTime,
    );

    if (minDuration > 0 && overlapDuration / minDuration > 0.5) {
      // Merge: keep the higher-scoring candidate, extend the time window
      const lastScore = last.confidence + last.goalFit;
      const currentScore = current.confidence + current.goalFit;
      const winner = currentScore > lastScore ? current : last;
      merged[merged.length - 1] = {
        ...winner,
        startTime: Math.min(last.startTime, current.startTime),
        endTime: Math.max(last.endTime, current.endTime),
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Step 3: Structural heuristics scoring
// ---------------------------------------------------------------------------

const CUE_PHRASES = [
  /the key (point|thing|takeaway|lesson) is/i,
  /most important/i,
  /here'?s (the|what|how)/i,
  /mistake/i,
  /in summary/i,
  /the secret/i,
  /game.?changer/i,
  /this is (why|how|what)/i,
  /number one/i,
  /first thing/i,
  /let me tell you/i,
  /you need to/i,
  /step (one|two|three|\d)/i,
];

export function computeStructuralScore(text: string): number {
  let score = 0;

  // Cue phrase density (0-0.4)
  const words = text.split(/\s+/).length;
  let cueHits = 0;
  for (const pattern of CUE_PHRASES) {
    if (pattern.test(text)) cueHits++;
  }
  score += Math.min(0.4, (cueHits / Math.max(words, 1)) * 20);

  // Lexical density — ratio of unique words to total (0-0.3)
  const wordList = text.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(wordList);
  const lexicalDensity = wordList.length > 0 ? uniqueWords.size / wordList.length : 0;
  score += Math.min(0.3, lexicalDensity * 0.4);

  // Short burst intensity — ideas per character (0-0.3)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const sentenceDensity = text.length > 0 ? sentences.length / (text.length / 100) : 0;
  score += Math.min(0.3, sentenceDensity * 0.15);

  return clamp01(score);
}

// ---------------------------------------------------------------------------
// Step 4: Ask-AI evidence scoring
// ---------------------------------------------------------------------------

/**
 * Query qa_evidence for segment references associated with this asset.
 * Returns a map of approximate startTime (rounded to 1s) → normalized score (0-1).
 *
 * Combines two signals per segment:
 * - reference count: how many times the segment was cited in QA answers
 * - relevance score: cosine similarity from the retrieval tool (when available)
 */
async function getQAEvidenceSignals(
  assetId: string,
): Promise<Map<string, number>> {
  // Join qa_evidence → transcript_segments → transcripts, filtered by assetId
  const rows = await db()
    .select({
      startTime: transcriptSegments.startTime,
      refCount: sql<number>`count(*)::int`,
      maxRelevance: sql<number>`coalesce(max(${qaEvidence.relevanceScore}), 0)`,
    })
    .from(qaEvidence)
    .innerJoin(
      transcriptSegments,
      eq(qaEvidence.segmentId, transcriptSegments.id),
    )
    .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id))
    .where(eq(transcripts.assetId, assetId))
    .groupBy(transcriptSegments.id, transcriptSegments.startTime);

  if (rows.length === 0) return new Map();

  // Normalize reference counts to 0-1
  const maxCount = Math.max(...rows.map((r) => r.refCount));
  const result = new Map<string, number>();

  for (const row of rows) {
    const key = String(Math.round(row.startTime));
    // Blend reference frequency (how often cited) with relevance quality
    const countSignal = row.refCount / maxCount;
    const relevanceSignal = row.maxRelevance;
    const score = relevanceSignal > 0
      ? 0.6 * countSignal + 0.4 * relevanceSignal
      : countSignal;

    const existing = result.get(key) ?? 0;
    result.set(key, Math.max(existing, score));
  }

  return result;
}

export function lookupQASignal(
  qaMap: Map<string, number>,
  startTime: number,
  endTime: number,
): number {
  // Check all integer-second keys within the moment's time range
  let maxSignal = 0;
  for (let t = Math.floor(startTime); t <= Math.ceil(endTime); t++) {
    const signal = qaMap.get(String(t));
    if (signal !== undefined && signal > maxSignal) {
      maxSignal = signal;
    }
  }
  return maxSignal;
}

// ---------------------------------------------------------------------------
// Step 5: Preset-specific boosts
// ---------------------------------------------------------------------------

export function applyPresetBoost(
  candidate: ScoredCandidate,
  preset: PresetId,
  totalDuration: number,
  chunkText: string,
): number {
  let boost = 0;

  switch (preset) {
    case 'hook':
      // Boost first 20% of timeline
      if (candidate.startTime < totalDuration * 0.2) boost += 0.1;
      // Boost surprise/attention language
      if (/\b(wait|actually|surprising|shock|never|secret)\b/i.test(chunkText)) boost += 0.05;
      break;

    case 'actionable':
      // Boost imperative/how-to cues
      if (/\b(step \d|you (should|need|can|must)|how to|try this|do this)\b/i.test(chunkText))
        boost += 0.1;
      break;

    case 'quote':
      // Boost concise, high-density lines (short text relative to time span)
      const duration = candidate.endTime - candidate.startTime;
      if (duration > 0 && duration < 30) boost += 0.08;
      break;

    case 'story':
      // Boost emotional/narrative markers
      if (/\b(felt|remember|story|happened|realized|moment|changed|cried|laughed)\b/i.test(chunkText))
        boost += 0.1;
      break;

    case 'insight':
      // Boost conceptual language
      if (/\b(because|therefore|means|principle|reason|understand|framework|pattern)\b/i.test(chunkText))
        boost += 0.08;
      break;
  }

  return boost;
}

// ---------------------------------------------------------------------------
// Step 6: Ranking
// ---------------------------------------------------------------------------

export function rankCandidates(
  candidates: LLMCandidate[],
  qaMap: Map<string, number>,
  segmentTexts: Map<number, string>,
  preset: PresetId,
  totalDuration: number,
  topN: number,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const llmScore = (c.confidence + c.goalFit) / 2;
    const qaSignal = lookupQASignal(qaMap, c.startTime, c.endTime);

    // Find the closest segment text for structural scoring
    const nearestSecond = Math.round(c.startTime);
    let text = '';
    for (let t = nearestSecond - 2; t <= nearestSecond + 2; t++) {
      const found = segmentTexts.get(t);
      if (found) { text = found; break; }
    }

    const structuralScore = computeStructuralScore(text);

    // Weighted formula from plan: 0.45 * llm + 0.35 * qa + 0.20 * structural
    let finalScore = 0.45 * llmScore + 0.35 * qaSignal + 0.20 * structuralScore;

    // Apply preset-specific boost
    finalScore += applyPresetBoost(
      { ...c, llmScore, qaSignal, structuralScore, finalScore },
      preset,
      totalDuration,
      text,
    );

    return {
      title: c.title,
      rationale: c.rationale,
      startTime: c.startTime,
      endTime: c.endTime,
      llmScore,
      qaSignal,
      structuralScore,
      finalScore: clamp01(finalScore),
    };
  });

  // Sort descending by final score, take top N
  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored.slice(0, topN);
}

// ---------------------------------------------------------------------------
// Main generation pipeline
// ---------------------------------------------------------------------------

const MAX_TOTAL_CANDIDATES = 80;
const TOP_N_MOMENTS = 10;

export async function generateMoments(
  assetId: string,
  userId: string,
  preset: PresetId,
) {
  // 1. Load transcript segments
  const assetData = await AssetService.getWithTranscript(assetId, userId);
  if (!assetData?.transcript || assetData.segments.length === 0) {
    return [];
  }

  const { segments } = assetData;
  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
  const totalDuration = segments[segments.length - 1]!.endTime;

  // 2. Compute chunk config and chunk segments
  const config = getMomentChunkConfig(totalChars);
  const chunks = chunkSegmentsForMoments(
    segments.map((s) => ({ id: s.id, text: s.text, startTime: s.startTime, endTime: s.endTime })),
    config,
  );

  if (chunks.length === 0) return [];

  // 3. Extract LLM candidates from chunks (bounded concurrency)
  let candidates = await extractAllCandidates(
    chunks,
    preset,
    config.maxCandidatesPerChunk,
  );

  // Cap total candidates before rerank
  if (candidates.length > MAX_TOTAL_CANDIDATES) {
    // Pre-filter: keep highest raw LLM scores
    candidates.sort((a, b) => (b.confidence + b.goalFit) - (a.confidence + a.goalFit));
    candidates = candidates.slice(0, MAX_TOTAL_CANDIDATES);
  }

  // 4. Merge overlapping candidates
  candidates = mergeOverlapping(candidates);

  // 5. Get Ask-AI evidence signals
  const qaMap = await getQAEvidenceSignals(assetId);

  // 6. Build segment text lookup for structural scoring
  const segmentTexts = new Map<number, string>();
  for (const seg of segments) {
    segmentTexts.set(Math.round(seg.startTime), seg.text);
  }

  // 7. Rank and keep top N
  const ranked = rankCandidates(
    candidates,
    qaMap,
    segmentTexts,
    preset,
    totalDuration,
    TOP_N_MOMENTS,
  );

  // 8. Persist to database
  const rows = ranked.map((c) => ({
    assetId,
    userId,
    preset,
    title: c.title,
    rationale: c.rationale,
    startTime: c.startTime,
    endTime: c.endTime,
    score: c.finalScore,
    scoreBreakdown: {
      llmScore: c.llmScore,
      qaSignal: c.qaSignal,
      structuralScore: c.structuralScore,
    },
    source: c.qaSignal > 0 ? ('hybrid' as const) : ('llm' as const),
  }));

  return MomentService.insertMany(rows);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

