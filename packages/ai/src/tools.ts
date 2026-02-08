import { tool } from 'ai';
import { z } from 'zod';
import { findRelevantSegments, getTranscriptContext } from './retrieval';
import type { RelevantSegment } from './retrieval';

// --- Types ---

export interface ToolContext {
  assetId?: string;
  collectionId?: string;
}

export interface RetrieveResult {
  status: 'searching' | 'found';
  query: string;
  segments: RelevantSegment[];
  message: string;
}

interface ContextSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
}

export interface ContextResult {
  status: 'loading' | 'loaded';
  segments: ContextSegment[];
  message: string;
}

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
  const retrieveSegmentsTool = tool<
    z.infer<typeof retrieveSegmentsInput>,
    RetrieveResult
  >({
    description:
      'Search the transcript for segments relevant to the question. Always use this before answering a question about the video/audio content.',
    inputSchema: retrieveSegmentsInput,
    execute: async function* ({ query }): AsyncGenerator<RetrieveResult> {
      yield {
        status: 'searching',
        query,
        segments: [],
        message: `Searching for: "${query}"...`,
      };

      const segments = await findRelevantSegments(query, {
        assetId: context.assetId,
        collectionId: context.collectionId,
        limit: 8,
      });

      yield {
        status: 'found',
        query,
        segments,
        message: `Found ${segments.length} relevant segment${segments.length === 1 ? '' : 's'}.`,
      };
    },
  });

  const getTranscriptContextTool = tool<
    z.infer<typeof transcriptContextInput>,
    ContextResult
  >({
    description:
      'Fetch surrounding transcript segments for a specific timestamp window. Use this to get more context around a known segment.',
    inputSchema: transcriptContextInput,
    execute: async function* ({
      transcriptId,
      startTime,
      endTime,
      windowSeconds,
    }): AsyncGenerator<ContextResult> {
      yield {
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
        status: 'loaded',
        segments,
        message: `Loaded ${segments.length} context segment${segments.length === 1 ? '' : 's'}.`,
      };
    },
  });

  return {
    retrieve_segments: retrieveSegmentsTool,
    get_transcript_context: getTranscriptContextTool,
  } as const;
}
