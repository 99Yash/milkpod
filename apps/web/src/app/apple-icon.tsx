import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F1F2F 0%, #1AA6A6 100%)',
          borderRadius: 40,
        }}
      >
        <svg
          width="120"
          height="120"
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
    ),
    { ...size },
  );
}
