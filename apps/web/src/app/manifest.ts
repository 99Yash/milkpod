import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Milkpod',
    short_name: 'Milkpod',
    description:
      'AI video transcription and Q&A workspace that turns meetings, lectures, and interviews into searchable transcripts, highlights, and timestamped answers.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#1AA6A6',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
