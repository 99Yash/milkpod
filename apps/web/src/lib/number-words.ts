/**
 * Client-side number-word expansion for search highlighting.
 * Mirrors the server-side map in packages/api/src/modules/assets/number-words.ts
 */

const DIGIT_TO_WORD: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  '11': 'eleven',
  '12': 'twelve',
  '13': 'thirteen',
  '14': 'fourteen',
  '15': 'fifteen',
  '16': 'sixteen',
  '17': 'seventeen',
  '18': 'eighteen',
  '19': 'nineteen',
  '20': 'twenty',
};

const WORD_TO_DIGIT: Record<string, string> = Object.fromEntries(
  Object.entries(DIGIT_TO_WORD).map(([d, w]) => [w, d])
);

/**
 * Build a phrase-level highlight regex with number ↔ word alternatives at each
 * token position. Tokens are joined by `\s+` so the whole phrase matches as one
 * continuous highlight.
 *
 * Example: "level 3" → /(level\s+(?:3|three))/gi
 *          — highlights "level three" as a single phrase
 */
export function buildHighlightRegex(query: string): RegExp | null {
  const tokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const parts = tokens.map((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (token in DIGIT_TO_WORD) {
      const alt = DIGIT_TO_WORD[token]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `(?:${escaped}|${alt})`;
    }
    if (token in WORD_TO_DIGIT) {
      const alt = WORD_TO_DIGIT[token]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `(?:${escaped}|${alt})`;
    }
    return escaped;
  });

  return new RegExp(`(${parts.join('\\s+')})`, 'gi');
}
