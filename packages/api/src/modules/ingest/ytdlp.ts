import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 30_000;

export type VideoMetadata = {
  id: string;
  title: string;
  duration: number;
  channel: string;
  thumbnail: string;
  webpage_url: string;
};

export async function resolveMetadata(url: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync(
    'yt-dlp',
    ['-j', '--no-warnings', url],
    { timeout: TIMEOUT_MS }
  );

  const data = JSON.parse(stdout);
  return {
    id: data.id,
    title: data.title ?? data.fulltitle ?? 'Untitled',
    duration: data.duration ?? 0,
    channel: data.channel ?? data.uploader ?? '',
    thumbnail: data.thumbnail ?? '',
    webpage_url: data.webpage_url ?? url,
  };
}

export async function resolveAudioUrl(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'yt-dlp',
    ['--get-url', '-x', '--no-warnings', url],
    { timeout: TIMEOUT_MS }
  );

  const audioUrl = stdout.trim().split('\n')[0];
  if (!audioUrl) {
    throw new Error('yt-dlp returned empty audio URL');
  }
  return audioUrl;
}
