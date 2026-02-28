export interface WordLimitOption {
  value: number | null;
  label: string;
}

export const WORD_LIMIT_OPTIONS: WordLimitOption[] = [
  { value: 50, label: 'Brief (50 words)' },
  { value: 120, label: 'Short (120 words)' },
  { value: 250, label: 'Medium (250 words)' },
  { value: 500, label: 'Detailed (500 words)' },
  { value: null, label: 'No limit' },
];

export const DEFAULT_WORD_LIMIT = 250;
export const HARD_WORD_CAP = 1500;
export const DAILY_WORD_BUDGET = 2000;

export function wordLimitToMaxTokens(wordLimit: number): number {
  return Math.ceil(wordLimit * 1.3);
}
