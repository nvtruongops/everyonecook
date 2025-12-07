/**
 * Users API Service
 *
 * User profile and management endpoints
 */

import apiClient from './client';
import type { ApiResponse, User, UserProfile, PrivacySettings } from '@/types';

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<ApiResponse<UserProfile>> {
  const response = await apiClient.get('/users/me');
  return response.data;
}

/**
 * Get user profile by ID (with privacy filtering)
 * Returns filtered profile based on viewer's relationship with the user
 */
export async function getUserById(userId: string): Promise<ApiResponse<UserProfile>> {
  const response = await apiClient.get(`/users/${userId}/profile`);
  return response.data;
}

/**
 * Get other user's profile with relationship info
 */
export async function getOtherUserProfile(userId: string): Promise<
  ApiResponse<{
    profile: UserProfile;
    relationship: 'self' | 'friend' | 'stranger' | 'blocked';
    is_friend: boolean;
  }>
> {
  const response = await apiClient.get(`/users/${userId}/profile`);
  return response.data;
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  data: Partial<User>
): Promise<ApiResponse<UserProfile>> {
  const response = await apiClient.put(`/users/${userId}`, data);
  return response.data;
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(
  userId: string,
  settings: Partial<PrivacySettings>
): Promise<ApiResponse<PrivacySettings>> {
  const response = await apiClient.put(`/users/${userId}/privacy`, settings);
  return response.data;
}

// NOTE: uploadAvatar and uploadBackground removed - frontend uses presigned URLs
// See: frontend/components/profile/AvatarUpload.tsx (uses /users/profile/avatar/presigned)
// See: frontend/services/backgroundService.ts (uses /users/profile/background/presigned)

/**
 * Search users
 */
export async function searchUsers(query: string): Promise<ApiResponse<User[]>> {
  const response = await apiClient.get('/users/search', {
    params: { q: query },
  });
  return response.data;
}

/**
 * Delete user account
 */
export async function deleteAccount(userId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/users/${userId}`);
  return response.data;
}
