'use client';
interface LogoProps {
  size?: number;
  className?: string;
  showBackground?: boolean;
}

export default function Logo({ size = 40, className = '', showBackground = true }: LogoProps) {
  const icon = (
    <svg
      width={showBackground ? size * 0.6 : size}
      height={showBackground ? size * 0.6 : size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={showBackground ? 'text-white' : className}
    >
      <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.20-1.10-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L9.7 14.70l.7.7 4.58-4.58z" />
      <path d="M2.88 15.68l1.24 1.24 1.41-1.41L4.29 14.27l-1.41 1.41zm2.83 2.83l1.24 1.24 1.41-1.41-1.24-1.24-1.41 1.41zm2.82 2.83l1.25 1.24 1.41-1.41-1.24-1.24-1.42 1.41z" />
    </svg>
  );
  if (!showBackground) return icon;
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#203d11] to-[#2a5016] rounded-2xl flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
        style={{ width: size, height: size }}
      >
        {icon}
      </div>
    </div>
  );
}
