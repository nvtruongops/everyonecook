/**
 * Friends API Service
 *
 * Friend relationships and requests endpoints
 */

import apiClient from './client';
import type { ApiResponse, User, PaginatedResponse } from '@/types';

export interface FriendRequest {
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted' | 'blocked';
  requestedBy: string;
  createdAt: string;
  acceptedAt?: string;
  user?: User;
}

/**
 * Get friend list
 */
export async function getFriends(): Promise<ApiResponse<User[]>> {
  const response = await apiClient.get('/friends');
  return response.data;
}

/**
 * Get pending friend requests
 */
export async function getFriendRequests(): Promise<ApiResponse<FriendRequest[]>> {
  const response = await apiClient.get('/friends/requests');
  return response.data;
}

/**
 * Send friend request
 */
export async function sendFriendRequest(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.post(`/friends/${userId}/request`);
  return response.data;
}

/**
 * Accept friend request
 */
export async function acceptFriendRequest(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.put(`/friends/${userId}/accept`);
  return response.data;
}

/**
 * Decline friend request
 */
export async function declineFriendRequest(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.put(`/friends/${userId}/reject`);
  return response.data;
}

/**
 * Remove friend
 */
export async function removeFriend(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/friends/${userId}`);
  return response.data;
}

/**
 * Block user
 */
export async function blockUser(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.post(`/friends/${userId}/block`);
  return response.data;
}

/**
 * Unblock user
 */
export async function unblockUser(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/friends/${userId}/block`);
  return response.data;
}

/**
 * Get blocked users
 */
export async function getBlockedUsers(): Promise<ApiResponse<User[]>> {
  const response = await apiClient.get('/friends/blocked');
  return response.data;
}

/**
 * Search users
 */
export async function searchUsers(query: string): Promise<ApiResponse<User[]>> {
  const response = await apiClient.get('/users/search', {
    params: { q: query },
  });
  return response.data;
}
