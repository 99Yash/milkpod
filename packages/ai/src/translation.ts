import { streamText } from 'ai';
import { visualModel } from './provider';
import { sanitizeStreamError } from './errors';

/**
 * Streams a translation, returning the Response for the client and a promise
 * that resolves to the full translated text (for persistence).
 */
export function streamTranslation(
  text: string,
  targetLanguage = 'English',
): { response: Response; text: PromiseLike<string> } {
  const result = streamText({
    model: visualModel,
    prompt: `Translate the following text to ${targetLanguage}. Preserve markdown formatting, timestamps in [MM:SS] format, and bullet point structure. Output ONLY the translation, nothing else.\n\n${text}`,
    onError: ({ error }) => {
      console.error('[Translation Error]', error instanceof Error ? error.message : 'Unknown error');
    },
  });

  return {
    response: result.toTextStreamResponse({
      onError: (error) => sanitizeStreamError(error).message,
    }),
    text: result.text,
  };
}
