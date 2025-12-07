/**
 * Feedback Service
 * Handles all feedback API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

// Types
// Chỉ có 2 trạng thái: pending (đang xử lý) và closed (đã đóng)
export type FeedbackStatus = 'pending' | 'closed';

export interface Feedback {
  feedbackId: string;
  userId: string;
  username?: string;
  userAvatarUrl?: string;
  title: string;
  content: string;
  status: FeedbackStatus;
  createdAt: number;
  updatedAt?: number;
}

export interface FeedbackReply {
  replyId: string;
  feedbackId: string;
  userId: string;
  username?: string;
  userAvatarUrl?: string;
  content: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface FeedbackWithReplies extends Feedback {
  replies: FeedbackReply[];
  replyCount: number;
}

export interface CreateFeedbackParams {
  title: string;
  content: string;
}

// Helper
async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(
      error.error?.message || error.message || error.error || `HTTP ${response.status}`
    );
  }

  const result = await response.json();
  return result.data || result;
}

// User APIs

/**
 * Create a new feedback
 */
export async function createFeedback(
  params: CreateFeedbackParams,
  token: string
): Promise<{ feedbackId: string }> {
  return apiRequest('/feedback', token, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Get user's own feedbacks
 */
export async function getMyFeedbacks(
  token: string
): Promise<{ feedbacks: Feedback[]; count: number }> {
  return apiRequest('/feedback/my', token);
}

/**
 * Get feedback detail with replies
 */
export async function getFeedbackDetail(
  feedbackId: string,
  token: string
): Promise<FeedbackWithReplies> {
  const result = await apiRequest<{
    feedback: Feedback;
    replies: FeedbackReply[];
    replyCount: number;
  }>(`/feedback/${feedbackId}`, token);
  return {
    ...result.feedback,
    replies: result.replies || [],
    replyCount: result.replyCount || 0,
  };
}

/**
 * Reply to a feedback (user)
 */
export async function replyToFeedback(
  feedbackId: string,
  content: string,
  token: string
): Promise<{ reply: FeedbackReply }> {
  return apiRequest(`/feedback/${feedbackId}/reply`, token, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

// Admin APIs

/**
 * Get all feedbacks (admin)
 */
export async function getAllFeedbacks(
  token: string,
  params: { status?: FeedbackStatus | 'all'; limit?: number } = {}
): Promise<{ feedbacks: Feedback[]; count: number }> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.set('status', params.status);
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const query = queryParams.toString();
  return apiRequest(`/admin/feedbacks${query ? `?${query}` : ''}`, token);
}

/**
 * Get feedback detail (admin)
 */
export async function getAdminFeedbackDetail(
  feedbackId: string,
  token: string
): Promise<FeedbackWithReplies> {
  const result = await apiRequest<{
    feedback: Feedback;
    replies: FeedbackReply[];
    replyCount: number;
  }>(`/admin/feedbacks/${feedbackId}`, token);
  return {
    ...result.feedback,
    replies: result.replies || [],
    replyCount: result.replyCount || 0,
  };
}

/**
 * Reply to a feedback (admin)
 */
export async function adminReplyToFeedback(
  feedbackId: string,
  content: string,
  token: string
): Promise<{ reply: FeedbackReply }> {
  return apiRequest(`/admin/feedbacks/${feedbackId}/reply`, token, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/**
 * Close a feedback (admin)
 */
export async function closeFeedback(feedbackId: string, token: string): Promise<void> {
  return apiRequest(`/admin/feedbacks/${feedbackId}/close`, token, {
    method: 'POST',
  });
}

// Status helpers - chỉ có 2 trạng thái
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: 'Đang xử lý',
  closed: 'Đã đóng',
};

export const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-gray-100 text-gray-800',
};
