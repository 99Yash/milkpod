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
  let parsed: URL;
  let hostname: string;
  let pathname: string;
  try {
    parsed = new URL(sourceUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    return null;
  }

  const sec = Math.floor(seconds);

  if (hostname === 'vimeo.com' || hostname.endsWith('.vimeo.com')) {
    const idFromSource = sourceId && /^\d+$/.test(sourceId) ? sourceId : null;
    const idFromPath = pathname
      .split('/')
      .filter(Boolean)
      .reverse()
      .find((segment) => /^\d+$/.test(segment));
    const id = idFromSource ?? idFromPath;
    if (id) {
      return {
        type: 'embed',
        url: `https://player.vimeo.com/video/${encodeURIComponent(id)}#t=${sec}s`,
      };
    }
  }

  if (hostname === 'dailymotion.com' || hostname.endsWith('.dailymotion.com') || hostname === 'dai.ly') {
    const idFromSource = sourceId && /^[a-zA-Z0-9]+$/.test(sourceId) ? sourceId : null;
    const idFromPath =
      pathname.match(/\/video\/([^/?_]+)/i)?.[1]
      ?? pathname.split('/').filter(Boolean).pop()?.split('_')[0]
      ?? null;
    const id = idFromSource ?? idFromPath;
    if (id) {
      return {
        type: 'embed',
        url: `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}?start=${sec}`,
      };
    }
  }

  if (hostname === 'twitch.tv' || hostname.endsWith('.twitch.tv')) {
    const idFromSource = sourceId && /^v?\d+$/i.test(sourceId) ? sourceId : null;
    const videoQuery = parsed.searchParams.get('video');
    const idFromQuery = videoQuery && /^v?\d+$/i.test(videoQuery) ? videoQuery : null;
    const idFromPath = pathname.match(/\/videos\/(\d+)/i)?.[1] ?? null;
    const id = idFromSource ?? idFromQuery ?? idFromPath;
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

  return { type: 'link', url: sourceUrl };
}
