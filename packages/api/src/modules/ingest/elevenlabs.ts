import { serverEnv } from '@milkpod/env/server';

export type ElevenLabsWord = {
  text: string;
  start: number;
  end: number;
  speaker_id: string | null;
  type: string;
};

export type TranscriptionResult = {
  text: string;
  language_code: string;
  words: ElevenLabsWord[];
};

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

  return (await response.json()) as TranscriptionResult;
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
