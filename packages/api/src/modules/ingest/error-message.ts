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

const CAPTION_UNAVAILABLE_PATTERNS = [
  'no caption tracks are available',
  'no caption tracks available',
  'no subtitles',
] as const;

const CAPTION_UNUSABLE_PATTERNS = [
  'caption tracks were found but could not be used',
  'caption track produced no usable segments',
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

  if (lower.includes('captions fallback failed')) {
    return 'Audio transcription failed, and caption fallback was not available for this URL.';
  }

  if (CAPTION_UNAVAILABLE_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return 'Captions are not available for this source URL.';
  }

  if (CAPTION_UNUSABLE_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return 'Captions were found, but none could be parsed for this source URL.';
  }

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
