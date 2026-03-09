import { serverEnv } from '@milkpod/env/server';
import { z } from 'zod';

const elevenLabsWordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  speaker_id: z.string().nullable(),
  type: z.string(),
});

const transcriptionResultSchema = z.object({
  text: z.string(),
  language_code: z.string(),
  words: z.array(elevenLabsWordSchema),
});

export type ElevenLabsWord = z.infer<typeof elevenLabsWordSchema>;
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'response';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

async function parseTranscriptionResult(
  response: Response
): Promise<TranscriptionResult> {
  const payload = await response.json().catch(() => {
    throw new Error('ElevenLabs API returned a non-JSON response');
  });

  const parsed = transcriptionResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `ElevenLabs API returned an invalid transcription payload: ${formatValidationIssues(parsed.error)}`
    );
  }

  return parsed.data;
}

function getApiKey(): string {
  const apiKey = serverEnv().ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }
  return apiKey;
}

async function callTranscriptionApi(formData: FormData): Promise<TranscriptionResult> {
  const response = await fetch(
    'https://api.elevenlabs.io/v1/speech-to-text',
    {
      method: 'POST',
      headers: { 'xi-api-key': getApiKey() },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorText}`
    );
  }

  return parseTranscriptionResult(response);
}

export async function transcribeAudio(
  audioUrl: string
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('model_id', 'scribe_v2');
  formData.append('cloud_storage_url', audioUrl);
  formData.append('diarize', 'true');
  formData.append('timestamps_granularity', 'word');
  return callTranscriptionApi(formData);
}

export async function transcribeFile(
  file: File
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('model_id', 'scribe_v2');
  formData.append('file', file);
  formData.append('diarize', 'true');
  formData.append('timestamps_granularity', 'word');
  return callTranscriptionApi(formData);
}
