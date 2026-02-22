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

export async function transcribeAudio(
  audioUrl: string
): Promise<TranscriptionResult> {
  const apiKey = serverEnv().ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const formData = new FormData();
  formData.append('model_id', 'scribe_v2');
  formData.append('cloud_storage_url', audioUrl);
  formData.append('diarize', 'true');
  formData.append('timestamps_granularity', 'word');

  const response = await fetch(
    'https://api.elevenlabs.io/v1/speech-to-text',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as TranscriptionResult;
  return data;
}
