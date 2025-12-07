'use client';
import { useEffect, useMemo } from 'react';
import { useAvatarCache } from '@/contexts/AvatarCacheContext';
import { normalizeImageUrl } from '@/lib/image-utils';

interface Props {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  fallbackText?: string;
  className?: string;
  priority?: boolean;
  isCurrentUser?: boolean;
}

export default function CachedAvatar({
  src,
  alt,
  size = 'md',
  fallbackText,
  className = '',
  priority = false,
  isCurrentUser = false,
}: Props) {
  const { getAvatarStatus, preloadAvatar, currentUserAvatar, currentUserAvatarStatus } =
    useAvatarCache();
  const avatarUrl = normalizeImageUrl(isCurrentUser ? currentUserAvatar : src);
  const status = isCurrentUser ? currentUserAvatarStatus : getAvatarStatus(avatarUrl);

  useEffect(() => {
    if (avatarUrl && status === 'unknown') preloadAvatar(avatarUrl);
  }, [avatarUrl, status, preloadAvatar]);
  useEffect(() => {
    if (priority && avatarUrl && status !== 'loaded') preloadAvatar(avatarUrl);
  }, [priority, avatarUrl, status, preloadAvatar]);

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

  const initials = useMemo(() => {
    const t = fallbackText || alt || 'U',
      w = t.trim().split(' ');
    return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : t[0].toUpperCase();
  }, [fallbackText, alt]);
  const gradient = useMemo(() => gradients[initials.charCodeAt(0) % gradients.length], [initials]);

  const showImage = avatarUrl && (status === 'loaded' || status === 'loading');
  const showSpinner = avatarUrl && status === 'loading';
  const showFallback = !avatarUrl || status === 'error';

  return (
    <div
      className={`relative ${sizes[size]} rounded-full overflow-hidden bg-[#f5f0e8] flex-shrink-0 ${className}`}
    >
      {showImage && avatarUrl && (
        <img
          src={avatarUrl}
          alt={alt}
          className={`w-full h-full object-cover rounded-full transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
          loading={priority ? 'eager' : 'lazy'}
        />
      )}
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f5f0e8] rounded-full">
          <div className="w-4 h-4 border-2 border-[#f5f0e8] border-t-[#203d11] rounded-full animate-spin" />
        </div>
      )}
      {showFallback && (
        <div
          className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient} shadow-inner`}
        >
          <span className="font-bold text-white drop-shadow-sm">{initials}</span>
        </div>
      )}
    </div>
  );
}
