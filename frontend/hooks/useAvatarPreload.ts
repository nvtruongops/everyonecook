/**
 * useAvatarPreload - Hook to preload avatars from data
 *
 * Usage:
 * - Call when fetching posts/comments/friends to preload their avatars
 * - Avatars will be ready before render, eliminating loading spinners
 */

import { useEffect, useRef } from 'react';
import { useAvatarCache } from '@/contexts/AvatarCacheContext';

/**
 * Preload avatars from an array of items
 * @param items - Array of items with avatar URLs
 * @param getAvatarUrl - Function to extract avatar URL from item
 */
export function useAvatarPreload<T>(
  items: T[] | undefined | null,
  getAvatarUrl: (item: T) => string | null | undefined
) {
  const { preloadAvatars } = useAvatarCache();
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!items || items.length === 0) return;

    const avatarUrls = items.map(getAvatarUrl).filter((url): url is string => !!url);

    // Filter out already preloaded URLs
    const newUrls = avatarUrls.filter((url) => !preloadedRef.current.has(url));

    if (newUrls.length > 0) {
      preloadAvatars(newUrls);
      // Mark as preloaded
      newUrls.forEach((url) => preloadedRef.current.add(url));
    }
  }, [items, getAvatarUrl, preloadAvatars]);
}

/**
 * Preload avatars from posts
 */
export function usePostAvatarsPreload(posts: Array<{ user_avatar?: string }> | undefined | null) {
  useAvatarPreload(posts, (post) => post.user_avatar);
}

/**
 * Preload avatars from comments
 */
export function useCommentAvatarsPreload(
  comments: Array<{ avatar_url?: string; user_avatar?: string }> | undefined | null
) {
  useAvatarPreload(comments, (comment) => comment.avatar_url || comment.user_avatar);
}

/**
 * Preload avatars from friends
 */
export function useFriendAvatarsPreload(friends: Array<{ avatarUrl?: string }> | undefined | null) {
  useAvatarPreload(friends, (friend) => friend.avatarUrl);
}

/**
 * Preload avatars from notifications
 */
export function useNotificationAvatarsPreload(
  notifications: Array<{ actorAvatar?: string }> | undefined | null
) {
  useAvatarPreload(notifications, (notification) => notification.actorAvatar);
}
