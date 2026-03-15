const URL_PATTERN = /https?:\/\/\S+/gi;
const MAX_MESSAGE_LENGTH = 240;

const REMOTE_AUDIO_ACCESS_PATTERNS = [
  'unable to download',
  'download error',
  'failed to access',
  'cannot access',
  'access denied',
  'audio url',
] as const;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function redactUrls(value: string): string {
  return value.replace(URL_PATTERN, '[redacted-url]');
}

function truncate(value: string): string {
  if (value.length <= MAX_MESSAGE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
}

export function sanitizeErrorMessage(rawMessage: string): string {
  const normalized = normalizeWhitespace(redactUrls(rawMessage));
  if (!normalized) return 'Unknown error';

  const lower = normalized.toLowerCase();
  if (REMOTE_AUDIO_ACCESS_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return 'Source audio could not be accessed from the origin URL.';
  }

  return truncate(normalized);
}

export function toSafeErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return sanitizeErrorMessage(error);
  }

  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message);
  }

  return 'Unknown error';
}
