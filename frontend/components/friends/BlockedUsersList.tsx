/**
 * Blocked Users List Component
 * Display list of blocked users with unblock action
 */

'use client';

import { useState, useEffect } from 'react';
import { getBlockedUsers, unblockUser } from '@/lib/api/friends';
import CachedAvatar from '@/components/ui/CachedAvatar';
import Toast from '@/components/Toast';
import type { User } from '@/types';

export default function BlockedUsersList() {
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    try {
      setLoading(true);
      const response = await getBlockedUsers();
      setBlockedUsers(response.data || []);
    } catch (error) {
      console.error('Failed to load blocked users:', error);
      setToast({ message: 'Failed to load blocked users', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      setUnblocking(userId);
      await unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((user) => user.userId !== userId));
      setToast({ message: 'User unblocked successfully', type: 'success' });
    } catch (error) {
      console.error('Failed to unblock user:', error);
      setToast({ message: 'Failed to unblock user', type: 'error' });
    } finally {
      setUnblocking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No blocked users</h3>
        <p className="mt-1 text-sm text-gray-500">You haven't blocked anyone yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Blocked Users ({blockedUsers.length})
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            These users can't see your posts, send you messages, or interact with your content.
          </p>

          <ul className="divide-y divide-gray-200">
            {blockedUsers.map((user) => (
              <li key={user.userId} className="py-4 flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <CachedAvatar
                    src={user.avatarUrl}
                    alt={user.displayName || user.username}
                    fallbackText={user.displayName || user.username}
                    size="lg"
                  />
                  <div className="ml-4 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-sm text-gray-500 truncate">@{user.username}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleUnblock(user.userId)}
                  disabled={unblocking === user.userId}
                  className="ml-4 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unblocking === user.userId ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Unblocking...
                    </>
                  ) : (
                    <>
                      <svg
                        className="-ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                        />
                      </svg>
                      Unblock
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
