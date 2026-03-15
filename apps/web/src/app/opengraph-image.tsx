import { ImageResponse } from 'next/og';

export const alt = 'Milkpod — AI Video Transcription & Q&A';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A0A0B 0%, #0F1F2F 40%, #0D3B3B 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40,
          }}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M46 31 A14 14 0 1 1 33 18"
              stroke="#F8FAFC"
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="42" cy="22" r="3.5" fill="#F2C14E" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#F8FAFC',
            letterSpacing: '-0.02em',
            marginBottom: 16,
          }}
        >
          Milkpod
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: '#94A3B8',
            maxWidth: 700,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          AI video transcription & Q&A workspace
        </div>

        {/* Accent line */}
        <div
          style={{
            marginTop: 40,
            width: 120,
            height: 4,
            borderRadius: 2,
            background: 'linear-gradient(90deg, #1AA6A6, #F2C14E)',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
