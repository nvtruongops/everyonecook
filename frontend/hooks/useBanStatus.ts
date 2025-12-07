'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface BanInfo {
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  banExpiresAt?: number;
  violationType?: string;
  violationContent?: string;
  reportCount?: number;
  postId?: string;
  commentId?: string;
}

const POLL_INTERVAL = 10000; // 10 seconds - faster polling to detect ban quickly

export function useBanStatus() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const isRedirecting = useRef(false);

  const checkBanStatus = useCallback(async () => {
    if (!user || !token || isRedirecting.current) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me/ban-status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.isBanned) {
          isRedirecting.current = true;
          setBanInfo({
            isBanned: true,
            banReason: data.data.banReason,
            bannedAt: data.data.bannedAt,
            banExpiresAt: data.data.banExpiresAt,
            violationType: data.data.violationType,
            violationContent: data.data.violationContent,
            reportCount: data.data.reportCount,
            postId: data.data.postId,
            commentId: data.data.commentId,
          });
          // Logout and redirect to banned page
          await logout();
          router.push(`/banned?username=${encodeURIComponent(user.username)}`);
        } else {
          setBanInfo(null);
        }
      } else if (response.status === 403 || response.status === 401) {
        // User might be banned or token invalid - check by username
        isRedirecting.current = true;
        await logout();
        router.push(`/banned?username=${encodeURIComponent(user.username)}`);
      }
    } catch {
      // Silently ignore errors - don't spam console
    }
  }, [user, token, logout, router]);

  // Poll ban status periodically
  useEffect(() => {
    if (!user || !token) return;

    // Check immediately when component mounts
    checkBanStatus();

    // Set up polling interval
    const interval = setInterval(checkBanStatus, POLL_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [user, token, checkBanStatus]);

  return {
    banInfo,
    checkBanStatus,
  };
}
