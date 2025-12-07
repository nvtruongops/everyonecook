/**
 * Notification Model
 *
 * Data models and types for user notifications
 */

/**
 * Notification type enum
 */
export type NotificationType =
  | 'new_reaction'
  | 'new_comment'
  | 'new_friend_request'
  | 'friend_accepted'
  | 'post_shared'
  | 'post_hidden'
  | 'comment_reply';

/**
 * Notification entity (DynamoDB)
 */
export interface Notification {
  // Primary Keys
  PK: string; // "USER#{userId}"
  SK: string; // "NOTIFICATION#{timestamp}"

  // Notification Data
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  actorId: string; // User who triggered the notification
  resourceId: string; // Post/Comment/User ID
  resourceType: 'post' | 'comment' | 'user';
  metadata: Record<string, any>;

  // Actor info (populated at runtime)
  actorName?: string;
  actorAvatar?: string;

  // Status
  isRead: boolean;

  // Timestamps
  createdAt: string;

  // GSI1 for querying unread notifications
  GSI1PK?: string; // "USER#{userId}#UNREAD"
  GSI1SK?: string; // timestamp
}

/**
 * Notification preferences entity (DynamoDB)
 */
export interface NotificationPreferences {
  // Primary Keys
  PK: string; // "USER#{userId}"
  SK: string; // "NOTIFICATION_PREFERENCES"

  // Preferences by type
  preferences: {
    new_reaction: boolean;
    new_comment: boolean;
    new_friend_request: boolean;
    friend_accepted: boolean;
    post_shared: boolean;
    post_hidden: boolean;
    comment_reply: boolean;
  };

  // Delivery channels
  pushEnabled: boolean;
  emailEnabled: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Update preferences request
 */
export interface UpdatePreferencesRequest {
  preferences?: {
    new_reaction?: boolean;
    new_comment?: boolean;
    new_friend_request?: boolean;
    friend_accepted?: boolean;
    post_shared?: boolean;
    post_hidden?: boolean;
    comment_reply?: boolean;
  };
  pushEnabled?: boolean;
  emailEnabled?: boolean;
}

/**
 * Default notification preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences['preferences'] = {
  new_reaction: true,
  new_comment: true,
  new_friend_request: true,
  friend_accepted: true,
  post_shared: true,
  post_hidden: true,
  comment_reply: true,
};
