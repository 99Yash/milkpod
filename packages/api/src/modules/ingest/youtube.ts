export type YouTubeMetadata = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  webpage_url: string;
};

export type CaptionItem = {
  text: string;
  offset: number;
  duration: number;
};

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

const VIDEO_ID_RE =
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

const CAPTION_RE = /<p t="(\d+)" d="(\d+)">([\s\S]*?)<\/p>/g;

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const ANDROID_USER_AGENT =
  'com.google.android.youtube/19.02.39 (Linux; U; Android 14) gzip';
const ANDROID_CLIENT_VERSION = '19.02.39';

export function extractVideoId(url: string): string {
  const match = url.match(VIDEO_ID_RE);
  if (match?.[1]) return match[1];
  throw new Error(`Could not extract video ID from URL: ${url}`);
}

export async function resolveYouTubeMetadata(
  url: string
): Promise<YouTubeMetadata> {
  const id = extractVideoId(url);

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oembedUrl);

  if (!response.ok) {
    throw new Error(`YouTube oEmbed failed (${response.status})`);
  }

  const data = (await response.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };

  return {
    id,
    title: data.title ?? 'Untitled',
    channel: data.author_name ?? '',
    thumbnail:
      data.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    webpage_url: `https://www.youtube.com/watch?v=${id}`,
  };
}

/**
 * Fetches caption tracks for a YouTube video via the Innertube player API
 * using the Android client (avoids bot detection that blocks the WEB client).
 */
async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_USER_AGENT,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: ANDROID_CLIENT_VERSION,
            androidSdkVersion: 34,
            hl: 'en',
          },
        },
        videoId,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Innertube player API failed (${res.status})`);
  }

  const data = (await res.json()) as {
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };

  const tracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('No caption tracks available for this video');
  }

  return tracks;
}

/**
 * Picks the best caption track: prefer manual English, then any manual,
 * then auto-generated English, then first available.
 */
function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack {
  const manual = tracks.filter((t) => t.kind !== 'asr');
  const auto = tracks.filter((t) => t.kind === 'asr');

  return (
    manual.find((t) => t.languageCode.startsWith('en')) ??
    manual[0] ??
    auto.find((t) => t.languageCode.startsWith('en')) ??
    tracks[0]!
  );
}

function parseTimedTextXml(xml: string): CaptionItem[] {
  const items: CaptionItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = CAPTION_RE.exec(xml)) !== null) {
    items.push({
      offset: Number(match[1]),
      duration: Number(match[2]),
      text: match[3]!,
    });
  }

  return items;
}

export async function fetchYouTubeTranscript(
  url: string
): Promise<{ items: CaptionItem[]; language: string }> {
  const videoId = extractVideoId(url);
  const tracks = await fetchCaptionTracks(videoId);
  const track = pickBestTrack(tracks);

  const res = await fetch(track.baseUrl, {
    headers: { 'User-Agent': ANDROID_USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch caption track (${res.status})`);
  }

  const xml = await res.text();
  const items = parseTimedTextXml(xml);

  if (items.length === 0) {
    throw new Error('Caption track returned no segments');
  }

  return { items, language: track.languageCode };
}
