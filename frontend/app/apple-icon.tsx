import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};
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
          background: 'linear-gradient(135deg, #203d11 0%, #2a5016 100%)',
          borderRadius: '40px',
        }}
      >
        <svg
          width="108"
          height="108"
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.20-1.10-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L9.7 14.70l.7.7 4.58-4.58z" />
          <path d="M2.88 15.68l1.24 1.24 1.41-1.41L4.29 14.27l-1.41 1.41zm2.83 2.83l1.24 1.24 1.41-1.41-1.24-1.24-1.41 1.41zm2.82 2.83l1.25 1.24 1.41-1.41-1.24-1.24-1.42 1.41z" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
