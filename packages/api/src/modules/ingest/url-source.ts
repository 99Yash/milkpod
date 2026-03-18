import { resolveYouTubeMetadata } from './youtube';
import { assertSafeExternalParsedUrl } from './url-safety';

type IngestSourceType = 'youtube' | 'external';
type MediaType = 'audio' | 'video';

export type ResolvedUrlSource = {
  sourceType: IngestSourceType;
  sourceUrl: string;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  channelName?: string;
  thumbnailUrl?: string;
};

const AUDIO_EXTENSIONS = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'opus',
  'wav',
  'weba',
]);

const VIDEO_EXTENSIONS = new Set([
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
]);

const TRACKING_QUERY_PARAM_PREFIX = 'utm_';
const PLAYBACK_QUERY_PARAMS = new Set(['t', 'time', 'start', 's']);

function isYouTubeHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'youtu.be'
    || normalized.endsWith('.youtu.be')
    || normalized === 'youtube.com'
    || normalized.endsWith('.youtube.com')
  );
}

function isPlaybackPositionHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'vimeo.com'
    || normalized.endsWith('.vimeo.com')
    || normalized === 'dailymotion.com'
    || normalized.endsWith('.dailymotion.com')
    || normalized === 'dai.ly'
    || normalized === 'twitch.tv'
    || normalized.endsWith('.twitch.tv')
  );
}

function normalizeExternalSourceId(parsedUrl: URL): string {
  const normalized = new URL(parsedUrl.toString());
  normalized.hash = '';
  const stripPlaybackParams = isPlaybackPositionHost(normalized.hostname);

  for (const key of [...normalized.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith(TRACKING_QUERY_PARAM_PREFIX)
      || (stripPlaybackParams && PLAYBACK_QUERY_PARAMS.has(lower))
    ) {
      normalized.searchParams.delete(key);
    }
  }

  if (normalized.pathname.length > 1) {
    normalized.pathname = normalized.pathname.replace(/\/+$/, '');
    if (normalized.pathname.length === 0) {
      normalized.pathname = '/';
    }
  }

  return normalized.toString();
}

function inferMediaType(pathname: string): MediaType {
  const match = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match?.[1];
  if (!extension) return 'video';

  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'video';
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildFallbackTitle(parsedUrl: URL): string {
  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  const raw = segments[segments.length - 1];
  const candidate = raw
    ? safeDecode(raw)
        .replace(/\.[a-z0-9]{2,5}$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim()
    : '';

  if (candidate.length >= 3 && !/^[\d_\-]+$/.test(candidate)) {
    return candidate;
  }

  return `Media from ${parsedUrl.hostname}`;
}

export async function resolveUrlSource(rawUrl: string): Promise<ResolvedUrlSource> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs are supported');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs with embedded credentials are not supported.');
  }

  if (isYouTubeHost(parsedUrl.hostname)) {
    const metadata = await resolveYouTubeMetadata(parsedUrl.toString());

    return {
      sourceType: 'youtube',
      sourceUrl: metadata.webpage_url,
      sourceId: metadata.id,
      mediaType: 'video',
      title: metadata.title,
      channelName: metadata.channel,
      thumbnailUrl: metadata.thumbnail,
    };
  }

  await assertSafeExternalParsedUrl(parsedUrl);

  const sourceUrl = parsedUrl.toString();
  const sourceId = normalizeExternalSourceId(parsedUrl);

  return {
    sourceType: 'external',
    sourceUrl,
    sourceId,
    mediaType: inferMediaType(parsedUrl.pathname),
    title: buildFallbackTitle(parsedUrl),
  };
}
