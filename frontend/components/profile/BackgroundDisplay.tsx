'use client';

import { useState, useEffect, useMemo } from 'react';

type DisplayVariant = 'profile' | 'edit-preview' | 'full';

interface BackgroundDisplayProps {
  backgroundUrl?: string;
  className?: string;
  /**
   * Display variant:
   * - 'profile': Compact height for profile page (like Facebook/LinkedIn cover)
   * - 'edit-preview': Same as profile but for edit page preview
   * - 'full': Full 16:9 aspect ratio
   */
  variant?: DisplayVariant;
  /** @deprecated Use variant instead. Use 16:9 aspect ratio */
  useAspectRatio?: boolean;
}

export default function BackgroundDisplay({
  backgroundUrl,
  className = '',
  variant = 'full',
  useAspectRatio = false,
}: BackgroundDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());

  // Reset loading state and update cache buster when URL changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setCacheBuster(Date.now());
  }, [backgroundUrl]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  // Memoize the image URL - updates when backgroundUrl or cacheBuster changes
  const imageUrl = useMemo(() => {
    if (!backgroundUrl) return '';
    // Add cache buster for CloudFront URLs to ensure fresh image after upload
    if (backgroundUrl.includes('cloudfront.net') || backgroundUrl.includes('everyonecook')) {
      const separator = backgroundUrl.includes('?') ? '&' : '?';
      return `${backgroundUrl}${separator}v=${cacheBuster}`;
    }
    return backgroundUrl;
  }, [backgroundUrl, cacheBuster]);

  // Determine container styles based on variant
  const getContainerStyles = () => {
    // Support legacy useAspectRatio prop
    if (useAspectRatio && variant === 'full') {
      return { aspectRatio: '16/9' };
    }

    switch (variant) {
      case 'profile':
      case 'edit-preview':
        // Use 16:9 aspect ratio to show full image without cropping
        return { aspectRatio: '16/9' };
      case 'full':
      default:
        return { aspectRatio: '16/9' };
    }
  };

  // Get height classes based on variant
  const getHeightClass = () => {
    switch (variant) {
      case 'profile':
      case 'edit-preview':
        return 'max-h-[350px] sm:max-h-[400px] md:max-h-[450px]';
      case 'full':
      default:
        return '';
    }
  };

  return (
    <div
      className={`relative overflow-hidden ${getHeightClass()} ${className}`}
      style={getContainerStyles()}
    >
      {/* Background Layer */}
      <div className="absolute inset-0">
        {backgroundUrl && !imageError ? (
          <>
            {/* Loading skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse" />
            )}

            {/* Custom background image */}
            <img
              src={imageUrl}
              alt="Profile background"
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />

            {/* Overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
          </>
        ) : (
          /* Default gradient background */
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600" />
        )}
      </div>
    </div>
  );
}
