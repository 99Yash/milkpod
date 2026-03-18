import { streamText } from 'ai';
import { visualModel } from './provider';

/**
 * Streams a translation and returns a web-standard Response with readable body.
 * Used for on-demand message translation in the chat UI.
 */
export function streamTranslation(
  text: string,
  targetLanguage = 'English',
): Response {
  const result = streamText({
    model: visualModel,
    prompt: `Translate the following text to ${targetLanguage}. Preserve markdown formatting, timestamps in [MM:SS] format, and bullet point structure. Output ONLY the translation, nothing else.\n\n${text}`,
  });

  return result.toTextStreamResponse();
}
