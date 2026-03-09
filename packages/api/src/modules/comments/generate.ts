import { generateText, Output } from 'ai';
import { z } from 'zod';
import { fastModel } from '@milkpod/ai/provider';
import { db } from '@milkpod/db';
import { videoContextSegments } from '@milkpod/db/schemas';
import { asc, eq } from 'drizzle-orm';
import { AssetService } from '../assets/service';
import { CommentService } from './service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptWindow {
  text: string;
  startTime: number;
  endTime: number;
  segmentIds: string[];
}

interface VisualWindow {
  summary: string;
  ocrText: string | null;
  entities: string[] | null;
  startTime: number;
  endTime: number;
  segmentId: string;
}

interface FusedWindow {
  startTime: number;
  endTime: number;
  transcript: string;
  visual: string | null;
  transcriptSegmentIds: string[];
  visualSegmentIds: string[];
}

// ---------------------------------------------------------------------------
// Zod schema for structured LLM output
// ---------------------------------------------------------------------------

const commentSchema = z.object({
  body: z
    .string()
    .describe(
      'The comment text — a concise, insightful observation about this section',
    ),
  startTime: z.number().describe('Start time in seconds'),
  endTime: z.number().describe('End time in seconds'),
  source: z
    .enum(['audio', 'visual', 'hybrid'])
    .describe(
      'What evidence this comment draws from: audio (transcript), visual (what is shown), or hybrid (both)',
    ),
});

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildCommentPrompt(windowCount: number): string {
  return `You are an expert video analyst generating insightful comments for video content. For each evidence window below, generate a concise comment that highlights the most valuable insight, observation, or noteworthy detail.

Rules:
- Each comment should be 1-3 sentences.
- Set source to "audio" if the insight comes from what was said (transcript), "visual" if from what was shown on screen, or "hybrid" if from both.
- Start and end times must fall within the evidence window's time range.
- Focus on substantive observations: key points, interesting details, notable visuals, important claims, or practical advice.
- Do not repeat the transcript verbatim — add analytical value.
- Generate at most one comment per evidence window. Skip windows with nothing noteworthy.
- Return at most ${windowCount} comments.`;
}

// ---------------------------------------------------------------------------
// Window construction
// ---------------------------------------------------------------------------

const WINDOW_DURATION = 45; // seconds
const MAX_WINDOWS = 30;

function buildTranscriptWindows(
  segments: { id: string; text: string; startTime: number; endTime: number }[],
): TranscriptWindow[] {
  if (segments.length === 0) return [];

  const totalDuration = segments[segments.length - 1]!.endTime;
  const windowCount = Math.min(
    MAX_WINDOWS,
    Math.ceil(totalDuration / WINDOW_DURATION),
  );
  const windowSize = totalDuration / windowCount;

  const windows: TranscriptWindow[] = [];
  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    const end = (i + 1) * windowSize;
    const windowSegs = segments.filter(
      (s) => s.startTime < end && s.endTime > start,
    );
    if (windowSegs.length === 0) continue;
    windows.push({
      text: windowSegs.map((s) => s.text).join(' '),
      startTime: start,
      endTime: end,
      segmentIds: windowSegs.map((s) => s.id),
    });
  }

  return windows;
}

function fuseWindows(
  transcriptWindows: TranscriptWindow[],
  visualSegments: VisualWindow[],
): FusedWindow[] {
  return transcriptWindows.map((tw) => {
    // Find visual segments that overlap with this transcript window
    const overlapping = visualSegments.filter(
      (vs) => vs.startTime < tw.endTime && vs.endTime > tw.startTime,
    );

    let visual: string | null = null;
    const visualSegmentIds: string[] = [];

    if (overlapping.length > 0) {
      const parts = overlapping.map((vs) => {
        visualSegmentIds.push(vs.segmentId);
        const sub = [vs.summary];
        if (vs.ocrText) sub.push(`[On-Screen Text] ${vs.ocrText}`);
        if (vs.entities?.length) sub.push(`[Entities] ${vs.entities.join(', ')}`);
        return sub.join('\n');
      });
      visual = parts.join('\n---\n');
    }

    return {
      startTime: tw.startTime,
      endTime: tw.endTime,
      transcript: tw.text,
      visual,
      transcriptSegmentIds: tw.segmentIds,
      visualSegmentIds,
    };
  });
}

function formatWindowsForPrompt(windows: FusedWindow[]): string {
  return windows
    .map((w, i) => {
      const header = `[Window ${i + 1}] ${formatTime(w.startTime)} – ${formatTime(w.endTime)}`;
      const parts = [header, `Transcript: ${w.transcript}`];
      if (w.visual) {
        parts.push(`Visual Context:\n${w.visual}`);
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Main generation pipeline
// ---------------------------------------------------------------------------

const MAX_COMMENTS = 20;

export async function generateComments(
  assetId: string,
  userId: string,
) {
  // 1. Load transcript segments
  const assetData = await AssetService.getWithTranscript(assetId, userId);
  if (!assetData?.transcript || assetData.segments.length === 0) {
    return [];
  }

  const { segments } = assetData;

  // 2. Load visual context segments (may be empty if not a video or extraction pending)
  const visualRows = await db()
    .select({
      id: videoContextSegments.id,
      summary: videoContextSegments.summary,
      ocrText: videoContextSegments.ocrText,
      entities: videoContextSegments.entities,
      startTime: videoContextSegments.startTime,
      endTime: videoContextSegments.endTime,
    })
    .from(videoContextSegments)
    .where(eq(videoContextSegments.assetId, assetId))
    .orderBy(asc(videoContextSegments.startTime));

  const visualWindows: VisualWindow[] = visualRows.map((r) => ({
    segmentId: r.id,
    summary: r.summary,
    ocrText: r.ocrText,
    entities: r.entities as string[] | null,
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  // 3. Build fused evidence windows
  const transcriptWindows = buildTranscriptWindows(
    segments.map((s) => ({
      id: s.id,
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  );

  const fusedWindows = fuseWindows(transcriptWindows, visualWindows);

  if (fusedWindows.length === 0) return [];

  // 4. Generate comments via LLM
  const prompt = formatWindowsForPrompt(fusedWindows);
  const maxComments = Math.min(MAX_COMMENTS, fusedWindows.length);

  const result = await generateText({
    model: fastModel,
    system: buildCommentPrompt(maxComments),
    prompt,
    output: Output.array({
      element: commentSchema,
      name: 'comments',
      description: 'Timestamped comments generated from fused evidence',
    }),
    maxOutputTokens: 4096,
  });

  const rawComments = result.output ?? [];

  // 5. Map comments to DB rows with evidence references
  const rows = rawComments
    .filter((c) => c.endTime > c.startTime && c.body.length > 0)
    .slice(0, MAX_COMMENTS)
    .map((c) => {
      // Find the fused window this comment belongs to
      const window = fusedWindows.find(
        (w) => c.startTime >= w.startTime && c.startTime < w.endTime,
      );

      // Determine source: if visual context was available in the window
      let source = c.source;
      if (!window?.visual && source !== 'audio') {
        source = 'audio' as const;
      }

      return {
        assetId,
        userId,
        body: c.body,
        startTime: Math.max(0, c.startTime),
        endTime: c.endTime,
        source,
        evidenceRefs: window
          ? {
              transcriptSegmentIds: window.transcriptSegmentIds,
              visualSegmentIds: window.visualSegmentIds,
            }
          : undefined,
      };
    });

  // 6. Persist
  return CommentService.insertMany(rows);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
