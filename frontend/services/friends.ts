/**
 * Friends Service
 * Handles all friend-related API calls
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

export interface Friend {
  userId: string;
  friendship_id?: string; // For compatibility with some components
  username: string;
  fullName: string;
  avatarUrl?: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
}

export interface FriendRequest {
  requestId: string;
  fromUserId: string;
  fromUsername: string;
  fromFullName: string;
  fromAvatarUrl?: string;
  createdAt: string;
}

export interface User {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
}

export type FriendshipStatus =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'blocked'
  | 'blocked_by';

export interface SearchResultUser {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  friendship_status: FriendshipStatus;
  is_friend: boolean;
  is_pending_sent: boolean;
  is_pending_received: boolean;
}

/**
 * Search users by username
 */
export async function searchUsers(
  token: string,
  query: string,
  limit: number = 20
): Promise<{ users: SearchResultUser[]; nextToken?: string }> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/users/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to search users');
  }

  const result = await response.json();
  return result.data || result;
}

/**
 * Send friend request
 * POST /friends/{userId}/request
 */
export async function sendFriendRequest(token: string, userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    // Handle 401/403 - token might be expired
    if (response.status === 401 || response.status === 403) {
      console.warn('[Friends] Auth error on sendFriendRequest, token may be expired');
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
    }

    try {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send friend request');
    } catch (parseError) {
      throw new Error('Failed to send friend request');
    }
  }
}

/**
 * Accept friend request
 * PUT /friends/{userId}/accept
 */
export async function acceptFriendRequest(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/accept`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to accept friend request');
  }
}

/**
 * Reject friend request
 * PUT /friends/{userId}/reject
 */
export async function rejectFriendRequest(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/reject`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reject friend request');
  }
}

/**
 * Cancel friend request (sender cancels their own request)
 * DELETE /friends/{userId}/cancel
 */
export async function cancelFriendRequest(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/cancel`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // Handle 401/403 - token might be expired
    if (response.status === 401 || response.status === 403) {
      console.warn('[Friends] Auth error on cancelFriendRequest, token may be expired');
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
    }

    try {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cancel friend request');
    } catch (parseError) {
      throw new Error('Failed to cancel friend request');
    }
  }
}

/**
 * Get friends list
 * GET /friends
 */
export async function getFriends(token: string): Promise<Friend[]> {
  const response = await fetch(`${API_BASE_URL}/friends`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch friends');
  }

  const result = await response.json();
  return result.friends || result.data?.friends || [];
}

/**
 * Get pending friend requests
 * GET /friends/requests
 */
export async function getPendingRequests(token: string): Promise<FriendRequest[]> {
  const response = await fetch(`${API_BASE_URL}/friends/requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch friend requests');
  }

  const result = await response.json();
  return result.requests || result.data?.requests || [];
}

/**
 * Get sent friend requests (requests I sent to others)
 * GET /friends/sent
 */
export async function getSentRequests(token: string): Promise<FriendRequest[]> {
  const response = await fetch(`${API_BASE_URL}/friends/sent`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch sent requests');
  }

  const result = await response.json();
  return result.requests || result.data?.requests || [];
}

/**
 * Remove friend (unfriend)
 * DELETE /friends/{userId}
 */
export async function removeFriend(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // Handle 401/403 - token might be expired, but don't redirect
    // Let the component handle the error gracefully
    if (response.status === 401 || response.status === 403) {
      console.warn('[Friends] Auth error on removeFriend, token may be expired');
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
    }

    try {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove friend');
    } catch (parseError) {
      // If response is not JSON, throw generic error
      throw new Error('Failed to remove friend');
    }
  }
}

/**
 * Block user
 * POST /friends/{userId}/block
 */
export async function blockUser(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/block`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // Handle 401/403 - token might be expired, but don't redirect
    if (response.status === 401 || response.status === 403) {
      console.warn('[Friends] Auth error on blockUser, token may be expired');
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
    }

    try {
      const error = await response.json();
      throw new Error(error.error || 'Failed to block user');
    } catch (parseError) {
      throw new Error('Failed to block user');
    }
  }
}

/**
 * Unblock user
 * DELETE /friends/{userId}/block
 */
export async function unblockUser(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/block`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // Handle 401/403 - token might be expired, but don't redirect
    if (response.status === 401 || response.status === 403) {
      console.warn('[Friends] Auth error on unblockUser, token may be expired');
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.');
    }

    try {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unblock user');
    } catch (parseError) {
      throw new Error('Failed to unblock user');
    }
  }
}

/**
 * Get blocked users
 * GET /friends/blocked
 */
export async function getBlockedUsers(token: string): Promise<Friend[]> {
  const response = await fetch(`${API_BASE_URL}/friends/blocked`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch blocked users');
  }

  const result = await response.json();
  return result.blockedUsers || result.data?.blockedUsers || [];
}

export type FriendshipStatusType =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'blocked'
  | 'blocked_by';

export interface FriendshipStatusResponse {
  status: FriendshipStatusType;
  friendship?: {
    userId: string;
    friendId: string;
    status: string;
    createdAt: string;
  };
}

/**
 * Get friendship status with a user
 * GET /friends/{userId}/status
 */
export async function getFriendshipStatus(
  token: string,
  userId: string
): Promise<FriendshipStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/friends/${userId}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch friendship status');
  }

  return response.json();
}
