import type { ElevenLabsWord } from './elevenlabs';

export type Segment = {
  segmentIndex: number;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
};

export function groupWordsIntoSegments(words: ElevenLabsWord[]): Segment[] {
  const segments: Segment[] = [];
  let currentWords: ElevenLabsWord[] = [];
  let currentSpeaker: string | null = null;

  const flush = () => {
    if (currentWords.length === 0) return;

    const text = currentWords
      .map((w) => w.text)
      .join('')
      .trim();

    if (text.length > 0) {
      segments.push({
        segmentIndex: segments.length,
        text,
        startTime: currentWords[0]!.start,
        endTime: currentWords[currentWords.length - 1]!.end,
        speaker: currentSpeaker,
      });
    }

    currentWords = [];
  };

  for (const word of words) {
    if (word.type !== 'word' && word.type !== 'punctuation') continue;

    const speaker = word.speaker_id ?? null;

    if (speaker !== currentSpeaker && currentWords.length > 0) {
      flush();
    }

    currentSpeaker = speaker;
    currentWords.push(word);
  }

  flush();

  return segments;
}
