import { serverEnv } from '@milkpod/env/server';
import { z } from 'zod';

const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';
const REQUEST_TIMEOUT_MS = 120_000;
const POLL_TIMEOUT_MS = 20 * 60_000;
const POLL_INTERVAL_MS = 2_000;
const REMOTE_FETCH_TIMEOUT_MS = 15 * 60_000;
const UPLOAD_TIMEOUT_MS = 15 * 60_000;

const transcriptStatusSchema = z.enum(['queued', 'processing', 'completed', 'error']);

const assemblyWordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  speaker: z.string().nullable().optional(),
});

const submitTranscriptSchema = z.object({
  id: z.string(),
  status: transcriptStatusSchema.optional(),
  error: z.string().nullable().optional(),
});

const transcriptSchema = z.object({
  id: z.string(),
  status: transcriptStatusSchema,
  text: z.string().default(''),
  language_code: z.string().nullable().optional(),
  words: z.array(assemblyWordSchema).optional(),
  error: z.string().nullable().optional(),
});

const uploadSchema = z.object({
  upload_url: z.string().url(),
});

type AssemblyWord = z.infer<typeof assemblyWordSchema>;
type AssemblyTranscript = z.infer<typeof transcriptSchema>;

export type TranscriptionWord = {
  text: string;
  start: number;
  end: number;
  speaker_id: string | null;
  type: 'word' | 'punctuation';
};

export type TranscriptionResult = {
  text: string;
  language_code: string;
  words: TranscriptionWord[];
};

function getApiKey(): string {
  const apiKey = serverEnv().ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY environment variable is not set');
  }
  return apiKey;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function parseJsonResponse(response: Response, label: string): Promise<unknown> {
  return response.json().catch(() => {
    throw new Error(`${label} returned a non-JSON response`);
  });
}

async function parseApiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === 'object') {
      if ('error' in payload && typeof payload.error === 'string') {
        return payload.error;
      }
      if ('message' in payload && typeof payload.message === 'string') {
        return payload.message;
      }
      return JSON.stringify(payload);
    }
  }

  const text = await response.text().catch(() => 'Unknown error');
  return text || 'Unknown error';
}

function classifyTokenType(text: string): 'word' | 'punctuation' {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'word';
  return /^[\p{P}\p{S}]+$/u.test(trimmed) ? 'punctuation' : 'word';
}

function mapWords(words: AssemblyWord[]): TranscriptionWord[] {
  return words.map((word) => ({
    text: word.text,
    start: word.start / 1000,
    end: word.end / 1000,
    speaker_id: word.speaker ?? null,
    type: classifyTokenType(word.text),
  }));
}

function toTranscriptionResult(transcript: AssemblyTranscript): TranscriptionResult {
  const languageCode = transcript.language_code?.trim();

  return {
    text: transcript.text,
    language_code: languageCode && languageCode.length > 0 ? languageCode : 'unknown',
    words: mapWords(transcript.words ?? []),
  };
}

async function submitTranscript(audioUrl: string): Promise<string> {
  const response = await fetch(`${ASSEMBLY_BASE_URL}/transcript`, {
    method: 'POST',
    headers: {
      Authorization: getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      language_detection: true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await parseApiError(response);
    throw new Error(
      `AssemblyAI submit failed (${response.status}): ${errorText}`
    );
  }

  const payload = await parseJsonResponse(response, 'AssemblyAI submit');
  const parsed = submitTranscriptSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `AssemblyAI submit returned an invalid payload: ${parsed.error.message}`
    );
  }

  if (parsed.data.status === 'error') {
    throw new Error(
      `AssemblyAI submit failed: ${parsed.data.error ?? 'Unknown submit error'}`
    );
  }

  return parsed.data.id;
}

async function getTranscript(transcriptId: string): Promise<AssemblyTranscript> {
  const response = await fetch(`${ASSEMBLY_BASE_URL}/transcript/${encodeURIComponent(transcriptId)}`, {
    method: 'GET',
    headers: {
      Authorization: getApiKey(),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await parseApiError(response);
    throw new Error(
      `AssemblyAI poll failed (${response.status}): ${errorText}`
    );
  }

  const payload = await parseJsonResponse(response, 'AssemblyAI poll');
  const parsed = transcriptSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `AssemblyAI poll returned an invalid payload: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function pollTranscript(transcriptId: string): Promise<AssemblyTranscript> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const transcript = await getTranscript(transcriptId);

    if (transcript.status === 'completed') {
      return transcript;
    }

    if (transcript.status === 'error') {
      throw new Error(
        `AssemblyAI transcription failed: ${transcript.error ?? 'Unknown transcription error'}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `AssemblyAI transcription timed out after ${Math.floor(POLL_TIMEOUT_MS / 1000)} seconds`
  );
}

type UploadBody = ReadableStream<Uint8Array> | Blob | ArrayBuffer;

function isReadableStreamBody(body: UploadBody): body is ReadableStream<Uint8Array> {
  return typeof body === 'object' && body !== null && 'getReader' in body;
}

async function uploadBody(body: UploadBody): Promise<string> {
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: {
      Authorization: getApiKey(),
      'Content-Type': 'application/octet-stream',
    },
    body,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  };

  if (isReadableStreamBody(body)) {
    requestInit.duplex = 'half';
  }

  const response = await fetch(`${ASSEMBLY_BASE_URL}/upload`, requestInit);

  if (!response.ok) {
    const errorText = await parseApiError(response);
    throw new Error(
      `AssemblyAI upload failed (${response.status}): ${errorText}`
    );
  }

  const payload = await parseJsonResponse(response, 'AssemblyAI upload');
  const parsed = uploadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `AssemblyAI upload returned an invalid payload: ${parsed.error.message}`
    );
  }

  return parsed.data.upload_url;
}

async function uploadRemoteAudio(audioUrl: string): Promise<string> {
  const sourceResponse = await fetch(audioUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Milkpod/1.0)',
    },
    signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
  });

  if (!sourceResponse.ok) {
    throw new Error(
      `Failed to download remote audio (${sourceResponse.status}) before AssemblyAI upload`
    );
  }

  if (!sourceResponse.body) {
    throw new Error('Remote audio download response had no body');
  }

  return uploadBody(sourceResponse.body);
}

async function transcribeViaUrl(audioUrl: string): Promise<TranscriptionResult> {
  const transcriptId = await submitTranscript(audioUrl);
  const transcript = await pollTranscript(transcriptId);
  return toTranscriptionResult(transcript);
}

function shouldRetryViaUpload(audioUrl: string, errorMessage: string): boolean {
  if (!isHttpUrl(audioUrl)) return false;

  try {
    const hostname = new URL(audioUrl).hostname.toLowerCase();
    if (hostname.endsWith('assemblyai.com')) {
      return false;
    }
  } catch {
    return false;
  }

  const message = errorMessage.toLowerCase();
  return (
    message.includes('forbidden') ||
    message.includes('failed to access') ||
    message.includes('cannot access') ||
    message.includes('access denied') ||
    message.includes('audio url') ||
    message.includes('download')
  );
}

export async function transcribeAudio(
  audioUrl: string
): Promise<TranscriptionResult> {
  try {
    return await transcribeViaUrl(audioUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown transcription error';

    if (!shouldRetryViaUpload(audioUrl, message)) {
      throw error;
    }

    const uploadUrl = await uploadRemoteAudio(audioUrl);
    return transcribeViaUrl(uploadUrl);
  }
}

export async function transcribeFile(
  file: File
): Promise<TranscriptionResult> {
  const uploadUrl = await uploadBody(file.stream());
  return transcribeViaUrl(uploadUrl);
}
