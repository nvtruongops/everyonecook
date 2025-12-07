/**
 * Comment Model
 *
 * Data models and types for post comments
 */

/**
 * Comment entity (DynamoDB)
 */
export interface Comment {
  // Primary Keys
  PK: string; // "POST#{postId}"
  SK: string; // "COMMENT#{commentId}"

  // Comment Data
  commentId: string;
  postId: string;
  authorId: string;

  content: string;
  parentCommentId?: string; // For nested replies

  // Metadata
  isEdited: boolean;
  editedAt?: string;
  createdAt: string;

  // GSI for user's comments
  GSI1PK: string; // "USER#{authorId}"
  GSI1SK: string; // "COMMENT#{timestamp}"
}

/**
 * Comment creation data
 */
export interface CommentCreateData {
  content: string;
  parentCommentId?: string; // For nested replies
}

/**
 * Comment update data
 */
export interface CommentUpdateData {
  content: string;
}
