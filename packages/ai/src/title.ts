import { generateText } from 'ai';
import { fastModel } from './provider';

const TITLE_TIMEOUT_MS = 12_000;

function fallbackTitle(userMessage: string): string {
  const cleaned = userMessage
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/["'`]/g, '')
    .replace(/[.!?]+$/, '');

  if (!cleaned) return 'New thread';

  const words = cleaned.split(' ').slice(0, 4);
  const title = words.join(' ').trim();
  return title || 'New thread';
}

/**
 * Generate a short, descriptive title for a chat thread from the user's first message.
 * Uses a cheap/fast model so it adds minimal latency and cost.
 */
export async function generateThreadTitle(userMessage: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: fastModel,
      system:
        'Generate a very short title (3-4 words max) for a conversation that starts with the following message. ' +
        'Capture the core topic. No quotes, no ending punctuation, no filler like "Help with" or "Question about". ' +
        'Respond with only the title.',
      prompt: userMessage,
      maxOutputTokens: 30,
      timeout: { totalMs: TITLE_TIMEOUT_MS },
    });

    const title = text.trim();
    return title.length > 0 ? title : fallbackTitle(userMessage);
  } catch (error) {
    console.warn(
      '[chat] Title generation failed, using fallback title:',
      error instanceof Error ? error.message : String(error)
    );
    return fallbackTitle(userMessage);
  }
}
