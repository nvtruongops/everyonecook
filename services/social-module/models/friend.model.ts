/**
 * Friend Model
 *
 * Data models and types for friend relationships
 */

/**
 * Friendship status enum
 */
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

/**
 * Friendship entity (DynamoDB)
 */
export interface Friendship {
  // Primary Keys
  PK: string; // "USER#{userId}"
  SK: string; // "FRIEND#{friendId}"

  // Relationship Data
  userId: string;
  friendId: string;
  status: FriendshipStatus;

  // Metadata
  requestedBy: string; // userId who sent request
  createdAt: string;
  acceptedAt?: string;

  // GSI1 for reverse lookup (find all users who are friends with friendId)
  GSI1PK: string; // "USER#{friendId}"
  GSI1SK: string; // "FRIEND#{userId}"
}

/**
 * Friend request data
 */
export interface FriendRequestData {
  friendId: string;
}

/**
 * Friend list item (for API responses)
 */
export interface FriendListItem {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
  status: FriendshipStatus;
  createdAt: string;
  acceptedAt?: string;
  mutualFriendsCount?: number;
}

/**
 * Friend request item (for API responses)
 */
export interface FriendRequestItem {
  requestId: string;
  fromUserId: string;
  fromUsername: string;
  fromFullName: string;
  fromAvatarUrl?: string;
  createdAt: string;
  mutualFriendsCount?: number;
}
