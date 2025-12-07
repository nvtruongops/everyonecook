/**
 * Notifications API Service
 *
 * User notifications endpoints
 */

import apiClient from './client';
import type { ApiResponse } from '@/types';

export interface Notification {
  notificationId: string;
  userId: string;
  type:
    | 'friend_request'
    | 'friend_accepted'
    | 'new_comment'
    | 'comment'
    | 'comment_reply'
    | 'new_reaction'
    | 'reaction'
    | 'mention'
    | 'post_shared'
    | 'post_hidden'
    | 'warning'
    | 'moderation'
    | 'WARNING'
    | 'POST_HIDDEN'
    | 'POST_DELETED'
    | 'APPEAL_APPROVED'
    | 'APPEAL_REJECTED';
  actorId: string;
  actorName?: string;
  actorAvatar?: string;
  resourceId: string;
  message?: string;
  title?: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  nextToken?: string;
  hasMore: boolean;
}

/**
 * Get notifications
 */
export async function getNotifications(nextToken?: string): Promise<NotificationsResponse> {
  const response = await apiClient.get('/notifications', {
    params: { nextToken },
  });
  return response.data;
}

/**
 * Get unread count
 */
export async function getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  const response = await apiClient.get('/notifications/unread/count');
  return response.data;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.put(`/notifications/${notificationId}/read`);
  return response.data;
}

/**
 * Mark all as read
 */
export async function markAllAsRead(): Promise<ApiResponse<void>> {
  const response = await apiClient.put('/notifications/read-all');
  return response.data;
}

/**
 * Delete notification
 */
export async function deleteNotification(notificationId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/notifications/${notificationId}`);
  return response.data;
}

/**
 * Delete all notifications
 */
export async function deleteAllNotifications(): Promise<ApiResponse<{ deletedCount: number }>> {
  const response = await apiClient.delete('/notifications');
  return response.data;
}
