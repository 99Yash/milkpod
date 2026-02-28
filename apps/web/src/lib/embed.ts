import type { Asset } from '@milkpod/api/types';

type SourceType = Asset['sourceType'];

type EmbedResult =
  | { type: 'embed'; url: string }
  | { type: 'link'; url: string }
  | null;

export function getEmbedUrl(
  sourceType: SourceType,
  sourceUrl: string | null,
  sourceId: string | null,
  seconds: number,
): EmbedResult {
  if (sourceType === 'upload' || !sourceUrl) return null;

  if (sourceType === 'youtube' && sourceId) {
    return {
      type: 'embed',
      url: `https://www.youtube.com/embed/${encodeURIComponent(sourceId)}?start=${Math.floor(seconds)}&autoplay=1`,
    };
  }

  if (sourceType === 'podcast') {
    return { type: 'link', url: sourceUrl };
  }

  return detectExternalEmbed(sourceUrl, sourceId, seconds);
}

function detectExternalEmbed(
  sourceUrl: string,
  sourceId: string | null,
  seconds: number,
): EmbedResult {
  let hostname: string;
  let pathname: string;
  try {
    const parsed = new URL(sourceUrl);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    return null;
  }

  const sec = Math.floor(seconds);

  if (hostname === 'vimeo.com' || hostname.endsWith('.vimeo.com')) {
    const id = sourceId ?? pathname.split('/').filter(Boolean).pop();
    if (id) {
      return {
        type: 'embed',
        url: `https://player.vimeo.com/video/${encodeURIComponent(id)}#t=${sec}s`,
      };
    }
  }

  if (hostname === 'dailymotion.com' || hostname.endsWith('.dailymotion.com') || hostname === 'dai.ly') {
    const id = sourceId ?? pathname.split('/').filter(Boolean).pop();
    if (id) {
      return {
        type: 'embed',
        url: `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}?start=${sec}`,
      };
    }
  }

  if (hostname === 'twitch.tv' || hostname.endsWith('.twitch.tv')) {
    const id = sourceId ?? pathname.split('/').filter(Boolean).pop();
    if (id) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const parent =
        typeof window !== 'undefined' && window.location
          ? window.location.hostname
          : null;
      if (parent) {
        return {
          type: 'embed',
          url: `https://player.twitch.tv/?video=${encodeURIComponent(id)}&time=${h}h${m}m${s}s&parent=${encodeURIComponent(parent)}`,
        };
      }
    }
  }

  try {
    const scheme = new URL(sourceUrl).protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return null;
  } catch {
    return null;
  }

  return { type: 'link', url: sourceUrl };
}
