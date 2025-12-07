/**
 * Notifications Service
 * Handles all notification-related API calls
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

export interface Notification {
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  actorId: string;
  resourceId: string;
  resourceType: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export enum NotificationType {
  FRIEND_REQUEST = 'friend_request',
  FRIEND_ACCEPTED = 'friend_accepted',
  NEW_REACTION = 'new_reaction',
  NEW_COMMENT = 'new_comment',
  COMMENT_REPLY = 'comment_reply',
}

export interface NotificationPreferences {
  preferences: {
    friend_request: boolean;
    friend_accepted: boolean;
    new_reaction: boolean;
    new_comment: boolean;
    comment_reply: boolean;
  };
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  nextToken?: string;
  hasMore: boolean;
}

/**
 * Get user's notifications (paginated)
 */
export async function getNotifications(
  token: string,
  limit: number = 20,
  nextToken?: string
): Promise<NotificationsResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (nextToken) {
    params.append('nextToken', nextToken);
  }

  const response = await fetch(`${API_BASE_URL}/notifications?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }

  return response.json();
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(token: string): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/notifications/unread/count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch unread count');
  }

  const data = await response.json();
  return data.unreadCount || 0;
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to mark notification as read');
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to mark all notifications as read');
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete notification');
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(token: string): Promise<NotificationPreferences> {
  const response = await fetch(`${API_BASE_URL}/notifications/preferences`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch notification preferences');
  }

  const data = await response.json();
  return data.preferences || data;
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  token: string,
  preferences: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const response = await fetch(`${API_BASE_URL}/notifications/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(preferences),
  });

  if (!response.ok) {
    throw new Error('Failed to update notification preferences');
  }

  const data = await response.json();
  return data.preferences || data;
}

/**
 * Helper: Get notification message based on type
 */
export function getNotificationMessage(notification: Notification): string {
  switch (notification.type) {
    case NotificationType.FRIEND_REQUEST:
      return `${notification.actorId} sent you a friend request`;
    case NotificationType.FRIEND_ACCEPTED:
      return `${notification.actorId} accepted your friend request`;
    case NotificationType.NEW_REACTION:
      const reactionType = notification.metadata?.reactionType || 'liked';
      return `${notification.actorId} ${reactionType} your ${notification.resourceType}`;
    case NotificationType.NEW_COMMENT:
      return `${notification.actorId} commented on your post`;
    case NotificationType.COMMENT_REPLY:
      return `${notification.actorId} replied to your comment`;
    default:
      return 'You have a new notification';
  }
}
