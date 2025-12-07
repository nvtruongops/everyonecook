/**
 * Add Friend Button Component
 * Displays on user profiles to send/manage friend requests
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  sendFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  getFriendshipStatus,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  type FriendshipStatusType,
} from '@/services/friends';

interface AddFriendButtonProps {
  userId: string;
  username: string;
}

export default function AddFriendButton({ userId, username }: AddFriendButtonProps) {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<FriendshipStatusType | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Check current friendship status
  useEffect(() => {
    const checkStatus = async () => {
      if (!token || user?.sub === userId) {
        setStatus('none');
        return;
      }

      try {
        const result = await getFriendshipStatus(token, userId);
        setStatus(result.status);
      } catch (err) {
        console.error('Failed to check friendship status:', err);
        setStatus('none');
      }
    };

    checkStatus();
  }, [token, userId, user]);

  const handleSendRequest = async () => {
    if (!token) return;

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await sendFriendRequest(freshToken, userId);
      setStatus('pending_sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to get fresh token before API calls
  const getFreshToken = async (): Promise<string | null> => {
    if (!token) return null;
    try {
      // Import authService dynamically to get fresh token
      const { authService } = await import('@/services/auth-service');
      const freshToken = await authService.getAccessToken(false);
      return freshToken;
    } catch {
      return token; // Fallback to current token
    }
  };

  const handleRemoveFriend = async () => {
    if (!token) {
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await removeFriend(userId, freshToken);
      setStatus('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!token) return;

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await blockUser(userId, freshToken);
      setStatus('blocked');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!token) return;

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await unblockUser(userId, freshToken);
      setStatus('none'); // After unblock, no longer friends
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unblock user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!token) return;

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await acceptFriendRequest(userId, freshToken);
      setStatus('friends');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!token) return;

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await rejectFriendRequest(userId, freshToken);
      setStatus('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!token) return;

    setActionLoading(true);
    setError(null);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
        return;
      }
      await cancelFriendRequest(userId, freshToken);
      setStatus('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };

  // Don't show button for own profile
  if (user?.sub === userId) {
    return null;
  }

  return (
    <div>
      {status === 'loading' && (
        <button
          disabled
          className="px-6 py-2 min-h-[44px] bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed font-medium"
        >
          Đang tải...
        </button>
      )}

      {status === 'none' && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSendRequest}
            disabled={actionLoading}
            className="px-6 py-2 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition font-medium"
          >
            {actionLoading ? 'Đang gửi...' : 'Kết bạn'}
          </button>
          <button
            onClick={handleBlock}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition text-sm font-medium"
          >
            Chặn
          </button>
        </div>
      )}

      {status === 'pending_sent' && (
        <div className="flex flex-wrap gap-2">
          <span className="px-6 py-2 min-h-[44px] bg-yellow-100 text-yellow-700 rounded-lg font-medium flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Đã gửi lời mời
          </span>
          <button
            onClick={handleCancelRequest}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition text-sm font-medium"
          >
            {actionLoading ? 'Đang hủy...' : 'Hủy lời mời'}
          </button>
          <button
            onClick={handleBlock}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition text-sm font-medium"
          >
            Chặn
          </button>
        </div>
      )}

      {status === 'pending_received' && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAcceptRequest}
            disabled={actionLoading}
            className="px-6 py-2 min-h-[44px] bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 transition font-medium"
          >
            {actionLoading ? 'Đang xử lý...' : 'Chấp nhận'}
          </button>
          <button
            onClick={handleRejectRequest}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition text-sm font-medium"
          >
            Từ chối
          </button>
          <button
            onClick={handleBlock}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition text-sm font-medium"
          >
            Chặn
          </button>
        </div>
      )}

      {status === 'friends' && (
        <div className="flex flex-wrap gap-2">
          <span className="px-6 py-2 min-h-[44px] bg-green-100 text-green-700 rounded-lg font-medium flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Bạn bè
          </span>
          <button
            onClick={handleRemoveFriend}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition text-sm font-medium"
          >
            {actionLoading ? 'Đang xử lý...' : 'Hủy kết bạn'}
          </button>
          <button
            onClick={handleBlock}
            disabled={actionLoading}
            className="px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition text-sm font-medium"
          >
            Chặn
          </button>
        </div>
      )}

      {status === 'blocked' && (
        <button
          onClick={handleUnblock}
          disabled={actionLoading}
          className="px-6 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition font-medium"
        >
          {actionLoading ? 'Đang xử lý...' : 'Bỏ chặn'}
        </button>
      )}

      {status === 'blocked_by' && (
        <button
          disabled
          className="px-6 py-2 min-h-[44px] bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed font-medium"
        >
          Không khả dụng
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
