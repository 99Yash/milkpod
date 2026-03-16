import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolveYouTubeMetadata } from './youtube';

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
const DNS_LOOKUP_TIMEOUT_MS = 5_000;

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

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
  );
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second, third] = octets;
  if (first === undefined || second === undefined || third === undefined) {
    return true;
  }

  return (
    first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();

  if (normalized === '::' || normalized === '::1') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    return isIP(mappedIpv4) === 4 ? isBlockedIpv4(mappedIpv4) : true;
  }

  return (
    normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
  );
}

function isBlockedIpAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);

  return true;
}

async function lookupAddresses(hostname: string): Promise<string[]> {
  const pendingLookup = lookup(hostname, { all: true, verbatim: true }).then((entries) =>
    entries.map((entry) => entry.address)
  );

  return await new Promise<string[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('URL host lookup timed out'));
    }, DNS_LOOKUP_TIMEOUT_MS);

    pendingLookup.then(
      (addresses) => {
        clearTimeout(timeout);
        resolve(addresses);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function assertSafeExternalUrl(parsedUrl: URL): Promise<void> {
  const hostname = parsedUrl.hostname;

  if (isBlockedHostname(hostname)) {
    throw new Error('Private network URLs are not allowed.');
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error('Private network URLs are not allowed.');
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await lookupAddresses(hostname);
  } catch {
    throw new Error('Could not resolve media host. Check the URL.');
  }

  if (addresses.length === 0) {
    throw new Error('Could not resolve media host. Check the URL.');
  }

  if (addresses.some((address) => isBlockedIpAddress(address))) {
    throw new Error('Private network URLs are not allowed.');
  }
}

export async function assertSafeExternalSourceUrl(rawUrl: string): Promise<void> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs are supported');
  }

  await assertSafeExternalUrl(parsedUrl);
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

  await assertSafeExternalUrl(parsedUrl);

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
