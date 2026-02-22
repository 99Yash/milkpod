import type { ElevenLabsWord } from './elevenlabs';
import type { CaptionItem } from './youtube';

export type Segment = {
  segmentIndex: number;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
};

const HTML_ENTITIES: Record<string, string> = {
  '&#39;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#?\w+;/g, (match) => HTML_ENTITIES[match] ?? match);
}

export function captionItemsToSegments(items: CaptionItem[]): Segment[] {
  return items.map((item, i) => ({
    segmentIndex: i,
    text: decodeHtmlEntities(item.text),
    startTime: item.offset / 1000,
    endTime: (item.offset + item.duration) / 1000,
    speaker: null,
  }));
}

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
