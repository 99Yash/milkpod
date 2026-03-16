import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
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

export type AudioStreamHandle = {
  stream: ReadableStream<Uint8Array>;
  waitForExit: () => Promise<void>;
  dispose: () => void;
};

export type YouTubeAudioStreamHandle = AudioStreamHandle;

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

const ytDlpSubtitleEntrySchema = z.object({
  url: z.string(),
  ext: z.string().optional(),
});

const ytDlpInfoSchema = z.object({
  subtitles: z.record(z.string(), z.array(ytDlpSubtitleEntrySchema)).optional(),
  automatic_captions: z
    .record(z.string(), z.array(ytDlpSubtitleEntrySchema))
    .optional(),
});

const VIDEO_ID_RE =
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

const CAPTION_RE = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
const TTML_P_RE = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;

const ANDROID_USER_AGENT =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip';
const ANDROID_CLIENT_VERSION = '20.10.38';
const YT_DLP_TIMEOUT_MS = 30 * 60_000;
const YT_DLP_INFO_TIMEOUT_MS = 90_000;
const YT_DLP_STDERR_LIMIT = 2_000;
const YT_DLP_STDOUT_LIMIT = 2_000_000;
const MAX_CAPTION_TRACK_ATTEMPTS = 8;

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
type YtDlpInfo = z.infer<typeof ytDlpInfoSchema>;

type YtDlpCaptionTrack = {
  url: string;
  ext: string;
  language: string;
  kind: 'manual' | 'auto';
};

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

function formatYtDlpError(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) return 'Unknown yt-dlp error';
  return trimmed.slice(-YT_DLP_STDERR_LIMIT);
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);/g,
    (token, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      if (lower === 'nbsp') return ' ';

      if (lower.startsWith('#x')) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        if (Number.isNaN(codePoint)) return token;
        return String.fromCodePoint(codePoint);
      }

      if (lower.startsWith('#')) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        if (Number.isNaN(codePoint)) return token;
        return String.fromCodePoint(codePoint);
      }

      return token;
    }
  );
}

function normalizeCaptionText(raw: string): string {
  const withoutTimestampTags = raw.replace(
    /<\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?>/g,
    ' '
  );
  const withLineBreaks = withoutTimestampTags.replace(/<br\s*\/?>/gi, ' ');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded.replace(/\s+/g, ' ').trim();
}

function parseTimestampToMs(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const base = trimmed.split(/\s+/)[0]?.replace(',', '.');
  if (!base) return null;

  const parts = base.split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  const hourRaw = parts.length === 3 ? parts[0] : '0';
  const minuteRaw = parts.length === 3 ? parts[1] : parts[0];
  const secondRaw = parts.length === 3 ? parts[2] : parts[1];

  if (!hourRaw || !minuteRaw || !secondRaw) return null;
  if (!/^\d+$/.test(hourRaw) || !/^\d+$/.test(minuteRaw)) return null;

  const secondsMatch = secondRaw.match(/^(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!secondsMatch) return null;

  const hours = Number(hourRaw);
  const minutes = Number(minuteRaw);
  const seconds = Number(secondsMatch[1]);
  const millis = Number((secondsMatch[2] ?? '0').padEnd(3, '0').slice(0, 3));

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function parseTimeExpressionToMs(rawValue: string): number | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  if (/^\d+(?:\.\d+)?ms$/i.test(value)) {
    return Math.round(Number.parseFloat(value));
  }

  if (/^\d+(?:\.\d+)?s$/i.test(value)) {
    return Math.round(Number.parseFloat(value) * 1000);
  }

  return parseTimestampToMs(value);
}

function parseCaptionBlocks(payload: string): string[][] {
  return payload
    .replace(/\uFEFF/g, '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trimEnd()));
}

function parseVttCaptions(vtt: string): CaptionItem[] {
  const items: CaptionItem[] = [];

  for (const lines of parseCaptionBlocks(vtt)) {
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;

    const timing = lines[timingIndex]!;
    const [startRaw, endRaw] = timing.split('-->');
    if (!startRaw || !endRaw) continue;

    const start = parseTimestampToMs(startRaw);
    const end = parseTimestampToMs(endRaw);
    if (start == null || end == null || end <= start) continue;

    const text = normalizeCaptionText(lines.slice(timingIndex + 1).join(' '));
    if (!text) continue;

    items.push({
      offset: start,
      duration: end - start,
      text,
    });
  }

  return items;
}

function parseSrtCaptions(srt: string): CaptionItem[] {
  const items: CaptionItem[] = [];

  for (const lines of parseCaptionBlocks(srt)) {
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;

    const timing = lines[timingIndex]!;
    const [startRaw, endRaw] = timing.split('-->');
    if (!startRaw || !endRaw) continue;

    const start = parseTimestampToMs(startRaw);
    const end = parseTimestampToMs(endRaw);
    if (start == null || end == null || end <= start) continue;

    const text = normalizeCaptionText(lines.slice(timingIndex + 1).join(' '));
    if (!text) continue;

    items.push({
      offset: start,
      duration: end - start,
      text,
    });
  }

  return items;
}

function parseJson3Captions(json3: string): CaptionItem[] {
  let payload: unknown;
  try {
    payload = JSON.parse(json3);
  } catch {
    return [];
  }

  if (!payload || typeof payload !== 'object' || !('events' in payload)) {
    return [];
  }

  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const items: CaptionItem[] = [];

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;

    const start = (event as { tStartMs?: unknown }).tStartMs;
    const duration = (event as { dDurationMs?: unknown }).dDurationMs;
    const segs = (event as { segs?: unknown }).segs;

    if (typeof start !== 'number') continue;
    if (!Array.isArray(segs) || segs.length === 0) continue;

    const text = normalizeCaptionText(
      segs
        .map((seg) =>
          typeof seg === 'object' && seg !== null && 'utf8' in seg
            ? String((seg as { utf8?: unknown }).utf8 ?? '')
            : ''
        )
        .join(' ')
    );

    if (!text) continue;

    const resolvedDuration =
      typeof duration === 'number' && duration > 0 ? duration : 2000;

    items.push({
      offset: start,
      duration: resolvedDuration,
      text,
    });
  }

  return items;
}

function parseTtmlCaptions(xml: string): CaptionItem[] {
  const items: CaptionItem[] = [];
  TTML_P_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TTML_P_RE.exec(xml)) !== null) {
    const attrs = match[1] ?? '';
    const content = match[2] ?? '';

    const beginRaw =
      attrs.match(/\bbegin="([^"]+)"/i)?.[1]
      ?? attrs.match(/\bt="([^"]+)"/i)?.[1]
      ?? null;
    const endRaw = attrs.match(/\bend="([^"]+)"/i)?.[1] ?? null;
    const durRaw =
      attrs.match(/\bdur="([^"]+)"/i)?.[1]
      ?? attrs.match(/\bd="([^"]+)"/i)?.[1]
      ?? null;

    const start = beginRaw ? parseTimeExpressionToMs(beginRaw) : null;
    if (start == null) continue;

    let end = endRaw ? parseTimeExpressionToMs(endRaw) : null;
    if (end == null && durRaw) {
      const dur = parseTimeExpressionToMs(durRaw);
      if (dur != null) {
        end = start + dur;
      }
    }

    if (end == null || end <= start) continue;

    const text = normalizeCaptionText(content);
    if (!text) continue;

    items.push({
      offset: start,
      duration: end - start,
      text,
    });
  }

  return items;
}

function parseCaptionPayload(payload: string, ext: string): CaptionItem[] {
  const normalizedExt = ext.toLowerCase();

  if (normalizedExt === 'vtt' || normalizedExt === 'webvtt') {
    return parseVttCaptions(payload);
  }

  if (normalizedExt === 'srt') {
    return parseSrtCaptions(payload);
  }

  if (normalizedExt === 'json3') {
    return parseJson3Captions(payload);
  }

  if (
    normalizedExt === 'xml'
    || normalizedExt === 'ttml'
    || normalizedExt === 'srv1'
    || normalizedExt === 'srv2'
    || normalizedExt === 'srv3'
  ) {
    const timedText = parseTimedTextXml(payload);
    return timedText.length > 0 ? timedText : parseTtmlCaptions(payload);
  }

  const vttItems = parseVttCaptions(payload);
  if (vttItems.length > 0) return vttItems;

  const srtItems = parseSrtCaptions(payload);
  if (srtItems.length > 0) return srtItems;

  const json3Items = parseJson3Captions(payload);
  if (json3Items.length > 0) return json3Items;

  const timedText = parseTimedTextXml(payload);
  if (timedText.length > 0) return timedText;

  return parseTtmlCaptions(payload);
}

function isEnglishLanguageCode(languageCode: string): boolean {
  return /^en(?:$|[-_])/i.test(languageCode.trim());
}

function captionFormatScore(ext: string): number {
  const normalized = ext.toLowerCase();
  if (normalized === 'vtt' || normalized === 'webvtt') return 0;
  if (normalized === 'srt') return 1;
  if (normalized === 'json3') return 2;
  if (
    normalized === 'xml'
    || normalized === 'ttml'
    || normalized === 'srv1'
    || normalized === 'srv2'
    || normalized === 'srv3'
  ) {
    return 3;
  }
  return 4;
}

function guessExtFromUrl(trackUrl: string): string {
  try {
    const parsed = new URL(trackUrl);
    const pathMatch = parsed.pathname.match(/\.([a-z0-9]+)$/i);
    if (pathMatch?.[1]) return pathMatch[1].toLowerCase();
  } catch {
    // fall through
  }

  const rawMatch = trackUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i);
  if (rawMatch?.[1]) return rawMatch[1].toLowerCase();

  return 'unknown';
}

function parseYtDlpJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('yt-dlp returned no metadata output');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .reverse();

    for (const line of lines) {
      try {
        return JSON.parse(line);
      } catch {
        continue;
      }
    }
  }

  throw new Error('yt-dlp returned malformed metadata output');
}

async function fetchYtDlpInfo(url: string): Promise<YtDlpInfo> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'yt-dlp',
      [
        '--no-playlist',
        '--no-progress',
        '--quiet',
        '--no-warnings',
        '--dump-single-json',
        '--skip-download',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let settled = false;
    let stdout = '';
    let stderr = '';

    const settleResolve = (value: YtDlpInfo) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timeout = setTimeout(() => {
      if (child.exitCode == null) {
        child.kill('SIGKILL');
      }
    }, YT_DLP_INFO_TIMEOUT_MS);

    const clearTimer = () => {
      clearTimeout(timeout);
    };

    if (!child.stdout || !child.stderr) {
      clearTimer();
      settleReject(new Error('yt-dlp did not expose stdout/stderr streams'));
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout = `${stdout}${chunk}`;
      if (stdout.length > YT_DLP_STDOUT_LIMIT) {
        stdout = stdout.slice(-YT_DLP_STDOUT_LIMIT);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`;
      if (stderr.length > YT_DLP_STDERR_LIMIT) {
        stderr = stderr.slice(-YT_DLP_STDERR_LIMIT);
      }
    });

    child.once('error', (error) => {
      clearTimer();
      const enoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (enoent) {
        settleReject(
          new Error(
            'yt-dlp is not installed on the server. Install yt-dlp to enable caption fallback for URL ingest.'
          )
        );
        return;
      }

      settleReject(new Error(`yt-dlp failed to start: ${error.message}`));
    });

    child.once('exit', (code, signal) => {
      clearTimer();

      if (signal === 'SIGKILL') {
        settleReject(
          new Error(
            `yt-dlp metadata extraction timed out after ${Math.floor(YT_DLP_INFO_TIMEOUT_MS / 1000)} seconds`
          )
        );
        return;
      }

      if (code !== 0) {
        const detail = formatYtDlpError(stderr);
        settleReject(
          new Error(
            `yt-dlp metadata extraction failed with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}: ${detail}`
          )
        );
        return;
      }

      let payload: unknown;
      try {
        payload = parseYtDlpJsonOutput(stdout);
      } catch (error) {
        settleReject(
          error instanceof Error
            ? error
            : new Error('yt-dlp returned malformed metadata output')
        );
        return;
      }

      const parsed = ytDlpInfoSchema.safeParse(payload);
      if (!parsed.success) {
        settleReject(
          new Error(`yt-dlp metadata payload was invalid: ${parsed.error.message}`)
        );
        return;
      }

      settleResolve(parsed.data);
    });
  });
}

function rankCaptionTrack(track: YtDlpCaptionTrack): [number, number] {
  const english = isEnglishLanguageCode(track.language);
  const group = track.kind === 'manual'
    ? english ? 0 : 1
    : english ? 2 : 3;
  const format = captionFormatScore(track.ext);
  return [group, format];
}

function collectYtDlpCaptionTracks(info: YtDlpInfo): YtDlpCaptionTrack[] {
  const tracks: YtDlpCaptionTrack[] = [];

  const append = (
    map: Record<string, Array<{ url: string; ext?: string }>> | undefined,
    kind: 'manual' | 'auto'
  ) => {
    if (!map) return;

    for (const [language, entries] of Object.entries(map)) {
      for (const entry of entries) {
        if (!entry.url) continue;

        tracks.push({
          url: entry.url,
          ext: (entry.ext ?? guessExtFromUrl(entry.url)).toLowerCase(),
          language,
          kind,
        });
      }
    }
  };

  append(info.subtitles, 'manual');
  append(info.automatic_captions, 'auto');

  const deduped = new Map<string, YtDlpCaptionTrack>();
  for (const track of tracks) {
    const key = `${track.kind}|${track.language}|${track.ext}|${track.url}`;
    if (!deduped.has(key)) {
      deduped.set(key, track);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const [groupA, formatA] = rankCaptionTrack(a);
    const [groupB, formatB] = rankCaptionTrack(b);

    if (groupA !== groupB) return groupA - groupB;
    if (formatA !== formatB) return formatA - formatB;

    return a.language.localeCompare(b.language);
  });
}

async function fetchCaptionTrackText(trackUrl: string): Promise<string> {
  const res = await fetch(trackUrl, {
    headers: {
      'User-Agent': ANDROID_USER_AGENT,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch caption track (${res.status})`);
  }

  return res.text();
}

export async function streamAudioViaYtDlp(
  url: string
): Promise<AudioStreamHandle> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'yt-dlp',
      [
        '--no-playlist',
        '--no-progress',
        '--quiet',
        '--no-warnings',
        '-f',
        'bestaudio/best',
        '-o',
        '-',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let settled = false;
    let stderr = '';

    const settleResolve = (value: AudioStreamHandle) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timeout = setTimeout(() => {
      if (child.exitCode == null) {
        child.kill('SIGKILL');
      }
    }, YT_DLP_TIMEOUT_MS);

    const clearTimer = () => {
      clearTimeout(timeout);
    };

    if (!child.stderr) {
      clearTimer();
      settleReject(new Error('yt-dlp did not expose stderr stream'));
      return;
    }

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`;
      if (stderr.length > YT_DLP_STDERR_LIMIT) {
        stderr = stderr.slice(-YT_DLP_STDERR_LIMIT);
      }
    });

    const exitPromise = new Promise<void>((resolveExit, rejectExit) => {
      child.once('error', (error) => {
        clearTimer();
        const enoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
        if (enoent) {
          rejectExit(
            new Error(
              'yt-dlp is not installed on the server. Install yt-dlp to enable resilient URL audio streaming.'
            )
          );
          return;
        }

        rejectExit(new Error(`yt-dlp failed to start: ${error.message}`));
      });

      child.once('exit', (code, signal) => {
        clearTimer();

        if (code === 0) {
          resolveExit();
          return;
        }

        if (signal === 'SIGKILL') {
          rejectExit(
            new Error(
              `yt-dlp timed out after ${Math.floor(YT_DLP_TIMEOUT_MS / 1000)} seconds`
            )
          );
          return;
        }

        const detail = formatYtDlpError(stderr);
        rejectExit(
          new Error(
            `yt-dlp exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}: ${detail}`
          )
        );
      });
    });

    child.once('spawn', () => {
      if (!child.stdout) {
        child.kill('SIGKILL');
        settleReject(new Error('yt-dlp did not expose stdout stream'));
        return;
      }

      settleResolve({
        stream: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
        waitForExit: () => exitPromise,
        dispose: () => {
          if (child.exitCode == null) {
            child.kill('SIGTERM');
          }
        },
      });
    });

    exitPromise.catch((error) => {
      if (!settled) {
        settleReject(error instanceof Error ? error : new Error('yt-dlp failed'));
      }
    });
  });
}

export const streamYouTubeAudioViaYtDlp = streamAudioViaYtDlp;

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
  CAPTION_RE.lastIndex = 0;
  const items: CaptionItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = CAPTION_RE.exec(xml)) !== null) {
    const text = normalizeCaptionText(match[3] ?? '');
    if (!text) continue;
    items.push({
      offset: Number(match[1]),
      duration: Number(match[2]),
      text,
    });
  }

  return items;
}

export async function fetchCaptionsViaYtDlp(
  url: string
): Promise<{ items: CaptionItem[]; language: string }> {
  const info = await fetchYtDlpInfo(url);
  const tracks = collectYtDlpCaptionTracks(info);

  if (tracks.length === 0) {
    throw new Error('No caption tracks are available for this URL');
  }

  const errors: string[] = [];
  const attempts = tracks.slice(0, MAX_CAPTION_TRACK_ATTEMPTS);

  for (const track of attempts) {
    try {
      const payload = await fetchCaptionTrackText(track.url);
      const items = parseCaptionPayload(payload, track.ext);

      if (items.length === 0) {
        throw new Error(
          `Caption track produced no usable segments (${track.language}/${track.ext})`
        );
      }

      return {
        items,
        language: track.language,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown caption track failure';
      errors.push(`${track.language}/${track.ext}: ${message}`);
    }
  }

  const detail = errors.slice(0, 2).join(' | ');
  throw new Error(
    detail.length > 0
      ? `Caption tracks were found but could not be used. ${detail}`
      : 'Caption tracks were found but could not be used.'
  );
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
