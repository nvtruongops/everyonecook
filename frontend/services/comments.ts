/**
 * Comments Service
 * TODO: Implement comments functionality
 */

export interface Comment {
  id: string;
  comment_id?: string; // API format
  postId: string;
  authorId: string;
  user_id?: string; // API format
  content: string;
  text?: string; // API format
  username?: string; // Author username
  avatar_url?: string; // Author avatar
  reply_count?: number; // Number of replies
  createdAt: string;
  created_at?: string; // API format
  updatedAt: string;
}

export const commentsService = {
  async getComments(postId: string, token: string): Promise<Comment[]> {
    // TODO: Implement API call
    return [];
  },

  async createComment(postId: string, content: string, token: string): Promise<Comment> {
    // TODO: Implement API call
    return {} as Comment;
  },

  async deleteComment(commentId: string, token: string): Promise<void> {
    // TODO: Implement API call
  },

  async updateComment(commentId: string, content: string, token: string): Promise<Comment> {
    // TODO: Implement API call
    return {} as Comment;
  },
};

// Export individual functions for compatibility
export const getComments = commentsService.getComments;
export const createComment = commentsService.createComment;
export const deleteComment = commentsService.deleteComment;
export const updateComment = commentsService.updateComment;

// User mention search
export async function searchUsersForMention(query: string, token: string): Promise<any[]> {
  // TODO: Implement API call
  return [];
}

// Report reasons for comments
export type CommentReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'inappropriate'
  | 'misinformation'
  | 'other';

/**
 * Report a comment
 * POST /posts/{postId}/comments/{commentId}/report
 */
export async function reportComment(
  token: string,
  postId: string,
  commentId: string,
  reason: CommentReportReason,
  details?: string
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/comments/${commentId}/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason, details }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || 'Failed to report comment');
  }
}

export const validateCommentContent = (content: string): { valid: boolean; error?: string } => {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Comment cannot be empty' };
  }
  if (content.length > 1000) {
    return { valid: false, error: 'Comment must be less than 1000 characters' };
  }
  return { valid: true };
};
