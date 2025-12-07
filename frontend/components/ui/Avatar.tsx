'use client';
import { useState, useEffect } from 'react';
import OptimizedImage from './OptimizedImage';

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  fallbackText?: string;
  className?: string;
  priority?: boolean;
}

export default function Avatar({
  src,
  alt,
  size = 'md',
  fallbackText,
  className = '',
  priority = false,
}: AvatarProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (src) {
      setError(false);
      setLoading(true);
    }
  }, [src]);

  const sizes: Record<string, string> = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-32 h-32 text-2xl',
  };
  const gradients = [
    'from-[#203d11] to-[#2a5016]',
    'from-[#975b1d] to-[#7a4a17]',
    'from-emerald-400 to-teal-500',
    'from-orange-400 to-red-500',
    'from-indigo-400 to-blue-500',
    'from-green-400 to-emerald-500',
    'from-purple-400 to-pink-500',
    'from-yellow-400 to-orange-500',
  ];

  const getInitials = () => {
    const t = fallbackText || alt || 'U',
      w = t.trim().split(' ');
    return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : t[0].toUpperCase();
  };
  const gradient = gradients[getInitials().charCodeAt(0) % gradients.length];

  return (
    <div
      className={`relative ${sizes[size]} rounded-full overflow-hidden bg-[#f5f0e8] flex-shrink-0 ${className}`}
    >
      {src && !error ? (
        <>
          <OptimizedImage
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes="(max-width: 768px) 64px, 80px"
            objectFit="cover"
            quality={90}
            className="rounded-full"
            onError={() => {
              setError(true);
              setLoading(false);
            }}
            onLoad={() => {
              setLoading(false);
              setError(false);
            }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#f5f0e8] rounded-full">
              <div className="w-4 h-4 border-2 border-[#f5f0e8] border-t-[#203d11] rounded-full animate-spin" />
            </div>
          )}
        </>
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient} shadow-inner`}
        >
          <span className="font-bold text-white drop-shadow-sm">{getInitials()}</span>
        </div>
      )}
    </div>
  );
}
