/**
 * Reaction Model
 *
 * Data models and types for post/comment reactions
 */

/**
 * Reaction type enum (5 types like Facebook)
 */
export type ReactionType = 'like' | 'love' | 'wow' | 'sad' | 'angry';

/**
 * Reaction entity (DynamoDB)
 */
export interface Reaction {
  // Primary Keys
  PK: string; // "POST#{postId}" or "COMMENT#{commentId}"
  SK: string; // "REACTION#{userId}"

  // Reaction Data
  targetId: string; // postId or commentId
  targetType: 'post' | 'comment';
  userId: string;
  reactionType: ReactionType;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Reaction summary (grouped by type)
 */
export interface ReactionSummary {
  [key: string]: {
    count: number;
    users: string[]; // User IDs who reacted with this type
  };
}

/**
 * Add/Update reaction request
 */
export interface AddReactionRequest {
  targetId: string;
  targetType: 'post' | 'comment';
  reactionType: ReactionType;
}

/**
 * Remove reaction request
 */
export interface RemoveReactionRequest {
  targetId: string;
  targetType: 'post' | 'comment';
}
