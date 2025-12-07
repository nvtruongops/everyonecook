'use client';
import Image from 'next/image';
import { useState } from 'react';
import { normalizeImageUrl } from '@/lib/image-utils';

interface Props {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  className?: string;
  sizes?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  quality?: number;
  placeholder?: 'blur' | 'empty';
  onLoad?: () => void;
  onError?: () => void;
}

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  className = '',
  sizes,
  objectFit = 'cover',
  quality = 75,
  placeholder = 'empty',
  onLoad,
  onError,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const defaultSizes = fill
    ? '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
    : undefined;
  const handleLoad = () => {
    setLoading(false);
    onLoad?.();
  };
  const handleError = () => {
    setLoading(false);
    setError(true);
    onError?.();
  };

  if (error)
    return (
      <div
        className={`bg-[#f5f0e8] flex items-center justify-center ${className}`}
        style={fill ? undefined : { width, height }}
      >
        <span className="text-[#203d11]/40 text-2xl">📷</span>
      </div>
    );

  return (
    <div className={`relative ${fill ? 'w-full h-full' : ''}`}>
      {loading && (
        <div
          className={`absolute inset-0 bg-[#f5f0e8] animate-pulse ${className}`}
          style={fill ? undefined : { width, height }}
        />
      )}
      <Image
        src={normalizeImageUrl(src) || src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        fill={fill}
        priority={priority}
        sizes={sizes || defaultSizes}
        quality={quality}
        placeholder={placeholder}
        className={`${className} ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        style={fill ? { objectFit } : undefined}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
      />
    </div>
  );
}
