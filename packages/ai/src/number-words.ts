/**
 * Bidirectional mapping between digit strings and English words (0–20)
 * used to expand transcript search queries so "3" also matches "three" etc.
 *
 * Shared between server-side (PostgreSQL tsquery) and client-side (regex highlighting).
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

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Build a PostgreSQL `to_tsquery('english', ...)` compatible string from a
 * free-text query. Each token is prefix-matched (`:*`) and number tokens are
 * expanded with their word equivalents (and vice versa) joined by `|` (OR).
 * Tokens are combined with `&` (AND).
 *
 * Example: `"level 3"` → `'level':* & ('3':* | 'three':*)`
 */
export function buildTsQuery(query: string): string | null {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return null;

  const parts = tokens.map((token) => {
    const alternatives: string[] = [token];

    if (token in DIGIT_TO_WORD) {
      alternatives.push(DIGIT_TO_WORD[token]!);
    } else if (token in WORD_TO_DIGIT) {
      alternatives.push(WORD_TO_DIGIT[token]!);
    }

    if (alternatives.length === 1) {
      return `'${alternatives[0]}':*`;
    }
    return `(${alternatives.map((a) => `'${a}':*`).join(' | ')})`;
  });

  return parts.join(' & ');
}

/**
 * Build a phrase-level highlight regex with number ↔ word alternatives at each
 * token position. Tokens are joined by `\s+` so the whole phrase matches as one
 * continuous highlight.
 *
 * Example: "level 3" → /(level\s+(?:3|three))/gi
 *          — highlights "level three" as a single phrase
 */
export function buildHighlightRegex(query: string): RegExp | null {
  const tokens = tokenizeQuery(query);
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
