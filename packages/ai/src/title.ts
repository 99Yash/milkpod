import { generateText } from 'ai';
import { fastModel } from './provider';

/**
 * Generate a short, descriptive title for a chat thread from the user's first message.
 * Uses a cheap/fast model so it adds minimal latency and cost.
 */
export async function generateThreadTitle(userMessage: string): Promise<string> {
  const { text } = await generateText({
    model: fastModel,
    system:
      'Generate a very short title (3-4 words max) for a conversation that starts with the following message. ' +
      'Capture the core topic. No quotes, no ending punctuation, no filler like "Help with" or "Question about". ' +
      'Respond with only the title.',
    prompt: userMessage,
    maxOutputTokens: 30,
  });

  return text.trim();
}
