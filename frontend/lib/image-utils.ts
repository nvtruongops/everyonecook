/**
 * Image URL utilities for handling CDN URLs
 */

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || 'https://cdn-dev.everyonecook.cloud';

// Known CDN domains that should be normalized
const CDN_DOMAINS = [
  'cdn.everyonecook.cloud',
  'cdn-dev.everyonecook.cloud',
];

/**
 * Normalize image URL to use the current environment's CDN
 * This handles cases where URLs in the database point to production CDN
 * but we're running in dev environment (or vice versa)
 */
export function normalizeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    
    // Check if this is a known CDN domain
    if (CDN_DOMAINS.includes(urlObj.hostname)) {
      // Replace with current environment's CDN URL
      const cdnUrlObj = new URL(CDN_URL);
      urlObj.hostname = cdnUrlObj.hostname;
      urlObj.protocol = cdnUrlObj.protocol;
      return urlObj.toString();
    }
    
    return url;
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Get a placeholder image URL for when images fail to load
 */
export function getPlaceholderImage(type: 'recipe' | 'avatar' | 'default' = 'default'): string {
  // Return a data URI for a simple placeholder
  const placeholders = {
    recipe: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"%3E%3Crect fill="%23f5f5f4" width="400" height="400"/%3E%3Cpath fill="%23d6d3d1" d="M200 120c-44.2 0-80 35.8-80 80s35.8 80 80 80 80-35.8 80-80-35.8-80-80-80zm0 140c-33.1 0-60-26.9-60-60s26.9-60 60-60 60 26.9 60 60-26.9 60-60 60z"/%3E%3Ccircle fill="%23d6d3d1" cx="230" cy="170" r="15"/%3E%3C/svg%3E',
    avatar: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect fill="%23e7e5e4" width="100" height="100"/%3E%3Ccircle fill="%23a8a29e" cx="50" cy="40" r="20"/%3E%3Cellipse fill="%23a8a29e" cx="50" cy="85" rx="30" ry="20"/%3E%3C/svg%3E',
    default: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"%3E%3Crect fill="%23f5f5f4" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23a8a29e" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E',
  };
  return placeholders[type];
}

/**
 * Handle image error by setting a placeholder
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  placeholderType: 'recipe' | 'avatar' | 'default' = 'default'
): void {
  const target = event.target as HTMLImageElement;
  target.src = getPlaceholderImage(placeholderType);
  target.onerror = null; // Prevent infinite loop
}
