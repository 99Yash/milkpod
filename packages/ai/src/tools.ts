import { tool } from 'ai';
import { z } from 'zod';
import {
  findRelevantSegments,
  findRelevantVisualSegments,
  getTranscriptContext,
  getTranscriptOverview,
} from './retrieval';
import { generateEmbedding } from './embeddings';
import type {
  ToolContext,
  RetrieveSegmentsOutput,
  GetTranscriptContextOutput,
  ReadTranscriptOutput,
} from './types';

// --- Schemas ---

const retrieveSegmentsInput = z.object({
  query: z.string().describe('The search query to find relevant segments'),
});

const transcriptContextInput = z.object({
  transcriptId: z.string().describe('The transcript ID'),
  startTime: z.number().describe('Start time in seconds'),
  endTime: z.number().describe('End time in seconds'),
  windowSeconds: z
    .number()
    .optional()
    .default(30)
    .describe(
      'Number of seconds of context to include around the window'
    ),
});

// --- Tool Set Factory ---

export function createQAToolSet(context: ToolContext = {}) {
  const retrieveSegmentsTool = tool({
    description:
      'Search for transcript and visual context segments relevant to the question. Returns what was said (audio transcript) and what was shown on screen (visual context) when available. Always use this before answering a question about the video/audio content.',
    inputSchema: retrieveSegmentsInput,
    execute: async function* ({ query }): AsyncGenerator<RetrieveSegmentsOutput> {
      yield {
        tool: 'retrieve',
        status: 'searching',
        query,
        segments: [],
        visualSegments: [],
        message: `Searching for: "${query}"...`,
      };

      const queryEmbedding = await generateEmbedding(query);
      const retrievalOpts = {
        assetId: context.assetId,
        collectionId: context.collectionId,
        queryEmbedding,
      };

      const [segments, visualSegments] = await Promise.all([
        findRelevantSegments(query, { ...retrievalOpts, limit: 8 }),
        findRelevantVisualSegments(query, { ...retrievalOpts, limit: 5 }),
      ]);

      const parts: string[] = [];
      if (segments.length > 0) parts.push(`${segments.length} transcript`);
      if (visualSegments.length > 0) parts.push(`${visualSegments.length} visual`);
      const total = segments.length + visualSegments.length;

      yield {
        tool: 'retrieve',
        status: 'found',
        query,
        segments,
        visualSegments,
        message: total === 0
          ? 'No relevant segments found.'
          : `Found ${parts.join(' and ')} segment${total === 1 ? '' : 's'}.`,
      };
    },
  });

  const getTranscriptContextTool = tool({
    description:
      'Fetch surrounding transcript segments for a specific timestamp window. Use this to get more context around a known segment.',
    inputSchema: transcriptContextInput,
    execute: async function* ({
      transcriptId,
      startTime,
      endTime,
      windowSeconds,
    }): AsyncGenerator<GetTranscriptContextOutput> {
      yield {
        tool: 'context',
        status: 'loading',
        segments: [],
        message: 'Loading transcript context...',
      };

      const segments = await getTranscriptContext(
        transcriptId,
        startTime,
        endTime,
        windowSeconds
      );

      yield {
        tool: 'context',
        status: 'loaded',
        segments,
        message: `Loaded ${segments.length} context segment${segments.length === 1 ? '' : 's'}.`,
      };
    },
  });

  const readTranscriptInput = z.object({});
  const readTranscriptTool = tool({
    description:
      'Read a broad overview of the entire transcript. Use this for synthesis tasks like summarizing, listing key points, extracting action items, or identifying themes — any task that requires understanding the full content rather than searching for a specific topic.',
    inputSchema: readTranscriptInput,
    execute: async function* (): AsyncGenerator<ReadTranscriptOutput> {
      yield {
        tool: 'read',
        status: 'loading',
        totalSegments: 0,
        segments: [],
        message: 'Reading transcript...',
      };

      if (!context.assetId) {
        yield {
          tool: 'read',
          status: 'loaded',
          totalSegments: 0,
          segments: [],
          message: 'No asset selected.',
        };
        return;
      }

      const overview = await getTranscriptOverview(context.assetId);

      if (!overview) {
        yield {
          tool: 'read',
          status: 'loaded',
          totalSegments: 0,
          segments: [],
          message: 'Transcript not found.',
        };
        return;
      }

      yield {
        tool: 'read',
        status: 'loaded',
        totalSegments: overview.totalSegments,
        segments: overview.sampledSegments,
        message: `Loaded ${overview.sampledSegments.length} segments (of ${overview.totalSegments} total).`,
      };
    },
  });

  return {
    retrieve_segments: retrieveSegmentsTool,
    get_transcript_context: getTranscriptContextTool,
    read_transcript: readTranscriptTool,
  } as const;
}

export type QAToolSet = ReturnType<typeof createQAToolSet>;
