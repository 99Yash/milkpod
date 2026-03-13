import { z } from 'zod';

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

const oembedResponseSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

const captionTrackSchema = z.object({
  baseUrl: z.string(),
  languageCode: z.string(),
  kind: z.string().optional(),
});

const adaptiveFormatSchema = z.object({
  itag: z.number(),
  url: z.string().optional(),
  mimeType: z.string(),
  bitrate: z.number().optional(),
});

const innertubePlayerResponseSchema = z.object({
  captions: z
    .object({
      playerCaptionsTracklistRenderer: z
        .object({
          captionTracks: z.array(captionTrackSchema).optional(),
        })
        .optional(),
    })
    .optional(),
  streamingData: z
    .object({
      adaptiveFormats: z.array(adaptiveFormatSchema).optional(),
    })
    .optional(),
});

const VIDEO_ID_RE =
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

const CAPTION_RE = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;

const ANDROID_USER_AGENT =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip';
const ANDROID_CLIENT_VERSION = '20.10.38';

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
  const response = await fetch(oembedUrl, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`YouTube oEmbed failed (${response.status})`);
  }

  const payload = await response.json().catch(() => {
    throw new Error('YouTube oEmbed returned a non-JSON response');
  });
  const parsed = oembedResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `YouTube oEmbed returned an invalid payload: ${parsed.error.message}`
    );
  }
  const data = parsed.data;

  return {
    id,
    title: data.title ?? 'Untitled',
    channel: data.author_name ?? '',
    thumbnail:
      data.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    webpage_url: `https://www.youtube.com/watch?v=${id}`,
  };
}

type InnertubePlayerResponse = z.infer<typeof innertubePlayerResponseSchema>;

/**
 * Fetches the Innertube player response for a YouTube video using the
 * Android client (avoids bot detection that blocks the WEB client).
 */
async function fetchInnertubePlayer(
  videoId: string
): Promise<InnertubePlayerResponse> {
  const res = await fetch(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
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
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    throw new Error(`Innertube player API failed (${res.status})`);
  }

  const payload = await res.json().catch(() => {
    throw new Error('Innertube player API returned a non-JSON response');
  });
  const parsed = innertubePlayerResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `Innertube player API returned an invalid payload: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const data = await fetchInnertubePlayer(videoId);

  const tracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('No caption tracks available for this video');
  }

  return tracks;
}

/**
 * Resolves a direct audio stream URL for a YouTube video from the
 * Innertube player response's streamingData.adaptiveFormats.
 */
export async function resolveYouTubeAudioUrl(url: string): Promise<string> {
  const videoId = extractVideoId(url);
  const data = await fetchInnertubePlayer(videoId);

  const formats = data.streamingData?.adaptiveFormats;
  if (!formats || formats.length === 0) {
    throw new Error('No streaming formats available for this video');
  }

  const audioFormats = formats
    .filter((f) => f.mimeType.startsWith('audio/') && f.url)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  if (audioFormats.length === 0) {
    throw new Error('No audio stream available for this video');
  }

  return audioFormats[0]!.url!;
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
    const text = match[3]!.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    items.push({
      offset: Number(match[1]),
      duration: Number(match[2]),
      text,
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
    signal: AbortSignal.timeout(30_000),
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
