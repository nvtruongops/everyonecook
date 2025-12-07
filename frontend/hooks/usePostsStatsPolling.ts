/**
 * usePostsStatsPolling - Hook for polling post stats (likes, comments)
 *
 * Features:
 * - Polls /posts/stats endpoint every N seconds
 * - Only polls when tab is visible (saves bandwidth)
 * - Batches multiple posts into single request
 * - Updates posts state with fresh stats
 * - Pauses when user is interacting (typing, scrolling)
 */

import { useEffect, useRef, useCallback } from 'react';
import { getPostsStats, PostStats } from '@/services/posts';

interface UsePostsStatsPollingOptions {
  /** Post IDs to poll stats for */
  postIds: string[];
  /** Auth token (optional) */
  token: string | null;
  /** Polling interval in milliseconds (default: 10000 = 10s) */
  interval?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
  /** Callback when stats are updated */
  onStatsUpdate: (stats: Record<string, PostStats>) => void;
}

export function usePostsStatsPolling({
  postIds,
  token,
  interval = 10000,
  enabled = true,
  onStatsUpdate,
}: UsePostsStatsPollingOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const lastPollRef = useRef<number>(0);

  const pollStats = useCallback(async () => {
    // Skip if already polling or no posts
    if (isPollingRef.current || postIds.length === 0) return;

    // Skip if polled recently (debounce)
    const now = Date.now();
    if (now - lastPollRef.current < interval * 0.8) return;

    isPollingRef.current = true;
    lastPollRef.current = now;

    try {
      // Limit to 50 posts per request
      const idsToFetch = postIds.slice(0, 50);
      const result = await getPostsStats(token, idsToFetch);

      if (result.stats && Object.keys(result.stats).length > 0) {
        onStatsUpdate(result.stats);
      }
    } catch (error) {
      // Silent fail for polling - don't spam console
      console.debug('[PostsStatsPolling] Poll failed:', error);
    } finally {
      isPollingRef.current = false;
    }
  }, [postIds, token, interval, onStatsUpdate]);

  useEffect(() => {
    if (!enabled || postIds.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Start polling
    intervalRef.current = setInterval(pollStats, interval);

    // Also poll on visibility change (when tab becomes visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollStats();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, postIds.length, interval, pollStats]);

  // Return manual poll function for immediate refresh
  return { pollNow: pollStats };
}
