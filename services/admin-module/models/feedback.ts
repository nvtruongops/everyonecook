/**
 * Feedback Model
 *
 * Defines types and interfaces for user feedback system
 */

// Chỉ có 2 trạng thái: pending (đang xử lý) và closed (đã đóng)
export type FeedbackStatus = 'pending' | 'closed';

export interface Feedback {
  PK: string; // USER#<userId>
  SK: string; // FEEDBACK#<feedbackId>
  feedbackId: string;
  userId: string;
  username?: string;
  userAvatarUrl?: string;
  title: string;
  content: string;
  status: FeedbackStatus;
  createdAt: number;
  updatedAt?: number;
  // For GSI queries
  GSI1PK: string; // FEEDBACK#<status>
  GSI1SK: string; // <createdAt>#<feedbackId>
}

export interface FeedbackReply {
  PK: string; // FEEDBACK#<feedbackId>
  SK: string; // REPLY#<replyId>
  replyId: string;
  feedbackId: string;
  userId: string;
  username?: string;
  userAvatarUrl?: string;
  content: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface CreateFeedbackInput {
  title: string;
  content: string;
}

export interface CreateReplyInput {
  feedbackId: string;
  content: string;
}

export interface FeedbackWithReplies extends Feedback {
  replies: FeedbackReply[];
  replyCount: number;
}
