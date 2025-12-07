/**
 * Admin Service
 * Handles all admin API calls for user management and content moderation
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

// Report types (defined here to avoid circular dependency)
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken' | 'resolved';

export interface Report {
  reportId: string;
  postId: string;
  reporterId: string;
  reporterUsername?: string;
  reason: string;
  description?: string;
  status: ReportStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  notes?: string;
}

// ============ Types ============

export interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  totalReports: number;
  pendingReports: number;
}

export interface User {
  userId: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  createdAt: string;
  lastLoginAt?: string;
  // Violation stats
  violationCount?: number;
  warningCount?: number;
  deletedPostCount?: number;
  deletedCommentCount?: number;
  banCount?: number;
  // Content stats
  postCount?: number;
  recipeCount?: number;
}

export interface SuspendedUser {
  user_id: string;
  username: string;
  email: string;
  suspension_reason: string;
  suspended_at: string;
  suspended_until: string;
  days_remaining: number;
  violation_count: number;
}

export interface Violation {
  violation_id: string;
  user_id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  created_at: string;
}

export interface DatabaseStats {
  timestamp: string;
  counts: {
    total_users: number;
    active_users: number;
    suspended_users: number;
    total_ingredients: number;
    dictionary_ingredients?: number; // Direct, đã duyệt
    cache_ingredients?: number; // AI tạo, chờ promote 100+
    total_recipes: number; // Recipes trong quản lý món ăn
    recipe_posts?: number; // Posts có công thức (postType = 'recipe_share')
    total_posts: number;
    total_cooking_sessions: number;
    total_violations: number;
    total_ai_cache?: number; // AI recipes 24h TTL
  };
  growth: {
    new_users_today: number;
    new_users_this_week: number;
    new_users_this_month: number;
    new_recipes_today: number;
    new_recipes_this_week: number;
    new_recipes_this_month: number;
  };
}

export interface UserViolation {
  violationId: string;
  userId: string;
  type: string;
  description: string;
  createdAt: string;
}

export interface BanHistoryRecord {
  banId: string;
  bannedAt: number;
  bannedBy?: string;
  banReason: string;
  banDuration: number;
  banExpiresAt?: number | null;
  unbannedAt?: number;
  unbannedBy?: string;
  unbanReason?: string;
}

export interface UserDetailResponse {
  profile: User & {
    bio?: string;
    banDuration?: number;
    banExpiresAt?: number | null;
    bannedBy?: string;
    recipeCount?: number;
    followerCount?: number;
    followingCount?: number;
  };
  violations: Violation[];
  banHistory: BanHistoryRecord[];
  stats: {
    totalViolations: number;
    totalBans: number;
    currentlyBanned: boolean;
  };
}

export interface GetUsersParams {
  limit?: number;
  page?: number;
  status?: 'all' | 'active' | 'banned';
  search?: string;
}

export interface GetUsersResponse {
  users: User[];
  count: number;
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

// Activity Log types - must match backend AdminActionTypes
export type AdminActionType =
  // User actions
  | 'BAN_USER'
  | 'UNBAN_USER'
  | 'DELETE_USER_CASCADE'
  | 'WARN_USER'
  // Post actions
  | 'DELETE_POST'
  | 'HIDE_POST'
  | 'RESTORE_POST'
  | 'RESTORE_CONTENT'
  | 'APPROVE_POST'
  | 'REJECT_POST'
  | 'DISMISS'
  // Comment actions
  | 'DELETE_COMMENT'
  | 'HIDE_COMMENT'
  | 'RESTORE_COMMENT'
  | 'COMMENT_WARN'
  | 'COMMENT_HIDE_COMMENT'
  | 'COMMENT_BAN_USER'
  | 'COMMENT_DISMISS'
  // Appeal actions
  | 'APPROVE_APPEAL'
  | 'REJECT_APPEAL'
  // System actions
  | 'CLEANUP_INACTIVE'
  | 'CLEANUP_USERS'
  | 'VIEW_SYSTEM_HEALTH'
  | 'VIEW_BUSINESS_METRICS'
  | 'VIEW_COST_DATA';

export interface ActivityLog {
  activityId: string;
  actionType: AdminActionType;
  adminUserId: string;
  adminUsername: string;
  targetUserId?: string;
  targetUsername?: string;
  targetPostId?: string;
  reason?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  timestamp: number;
  createdAt: string;
}

export interface GetActivityParams {
  limit?: number;
  lastKey?: string;
  actionType?: AdminActionType;
}

export interface GetActivityResponse {
  activities: ActivityLog[];
  count: number;
  lastKey?: string;
  hasMore: boolean;
}

// Report Statistics types
export interface ReportStatsBreakdown {
  count: number;
  percentage: number;
}

export interface ReportStatsSummary {
  reportId: string;
  targetId: string;
  targetType: 'post' | 'comment';
  reporterId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface ReportStats {
  stats: {
    byStatus: {
      pending: number;
      action_taken: number;
    };
    byType: {
      post: number;
      comment: number;
    };
    byReason: {
      spam: number;
      harassment: number;
      inappropriate: number;
      misinformation: number;
      other: number;
    };
    total: number;
    recentReports: ReportStatsSummary[];
  };
  summary: {
    total: number;
    pendingCount: number;
    needsAttention: boolean;
  };
  breakdown: {
    byStatus: {
      pending: ReportStatsBreakdown;
      action_taken: ReportStatsBreakdown;
    };
    byType: {
      post: ReportStatsBreakdown;
      comment: ReportStatsBreakdown;
    };
    byReason: {
      spam: ReportStatsBreakdown;
      harassment: ReportStatsBreakdown;
      inappropriate: ReportStatsBreakdown;
      misinformation: ReportStatsBreakdown;
      other: ReportStatsBreakdown;
    };
  };
  generatedAt: string;
}

export type BanDurationUnit = 'minutes' | 'hours' | 'days';

export interface BanUserParams {
  userId: string;
  reason: string;
  duration?: number;
  durationUnit?: BanDurationUnit;
}

// Preset ban reasons
export const BAN_REASONS = [
  { value: 'spam', label: 'Spam / Quảng cáo' },
  { value: 'harassment', label: 'Quấy rối người dùng khác' },
  { value: 'inappropriate', label: 'Nội dung không phù hợp' },
  { value: 'fake_account', label: 'Tài khoản giả mạo' },
  { value: 'violation', label: 'Vi phạm quy định cộng đồng' },
  { value: 'other', label: 'Lý do khác' },
] as const;

// Preset ban durations
export const BAN_DURATIONS = [
  { value: 30, unit: 'minutes' as BanDurationUnit, label: '30 phút' },
  { value: 1, unit: 'hours' as BanDurationUnit, label: '1 giờ' },
  { value: 6, unit: 'hours' as BanDurationUnit, label: '6 giờ' },
  { value: 12, unit: 'hours' as BanDurationUnit, label: '12 giờ' },
  { value: 1, unit: 'days' as BanDurationUnit, label: '1 ngày' },
  { value: 3, unit: 'days' as BanDurationUnit, label: '3 ngày' },
  { value: 7, unit: 'days' as BanDurationUnit, label: '7 ngày' },
  { value: 30, unit: 'days' as BanDurationUnit, label: '30 ngày' },
  { value: 0, unit: 'days' as BanDurationUnit, label: 'Vĩnh viễn' },
] as const;

// Ban status response
export interface BanStatusResponse {
  isBanned: boolean;
  userId?: string;
  username?: string;
  banReason?: string;
  bannedAt?: number;
  banExpiresAt?: number | null;
  banDurationDisplay?: string;
  remainingTime?: string;
  canAppeal: boolean;
  // Additional violation info
  violationType?: string;
  violationContent?: string;
  reportCount?: number;
  postId?: string;
  commentId?: string;
  // Appeal status
  appealStatus?: 'pending' | 'approved' | 'rejected';
  appealReviewNotes?: string;
  appealReviewedAt?: number;
  appealReviewedByUsername?: string;
}

// Appeal history item
export interface AppealHistoryItem {
  appealId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewedAt?: number;
  reviewedByUsername?: string;
  reviewNotes?: string;
}

// Appeal types
export type AppealType = 'ban' | 'content';

export interface Appeal {
  appealId: string;
  userId: string;
  username?: string;
  reason: string;
  contactEmail?: string;
  status: 'pending' | 'approved' | 'rejected';
  // Appeal type: 'ban' for account ban, 'content' for hidden post/comment
  appealType?: AppealType;
  // Ban appeal fields
  banReason?: string;
  banExpiresAt?: number | null;
  banDurationDisplay?: string;
  // Content appeal fields
  contentType?: 'post' | 'comment';
  contentId?: string;
  hiddenReason?: string;
  // Common fields
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewNotes?: string;
  // Violation details
  violationType?: string;
  postId?: string;
  commentId?: string;
  violationContent?: string;
  reportCount?: number;
  // Appeal history
  previousAppeals?: AppealHistoryItem[];
  appealCount?: number;
}

// ============ Helper Functions ============

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
    throw new Error(error.error?.message || error.message || `HTTP ${response.status}`);
  }

  const result = await response.json();
  // Backend wraps response in { data, correlationId }
  return result.data || result;
}

// ============ API Functions ============

/**
 * Get database statistics
 */
export async function getDatabaseStats(token: string): Promise<DatabaseStats> {
  return apiRequest<DatabaseStats>('/admin/stats', token);
}

/**
 * Get all users with pagination and filtering
 */
export async function getUsers(
  token: string,
  params: GetUsersParams = {}
): Promise<GetUsersResponse> {
  const queryParams = new URLSearchParams();
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.status) queryParams.set('status', params.status);
  if (params.search) queryParams.set('search', params.search);

  const query = queryParams.toString();
  const endpoint = `/admin/users${query ? `?${query}` : ''}`;

  return apiRequest<GetUsersResponse>(endpoint, token);
}

/**
 * Get suspended/banned users
 */
export async function getSuspendedUsers(token?: string): Promise<SuspendedUser[]> {
  if (!token) {
    console.warn('[AdminService] No token provided for getSuspendedUsers');
    return [];
  }

  try {
    const response = await apiRequest<{ users: any[] }>('/admin/users/banned', token);

    // Map backend response to SuspendedUser format
    return (response.users || []).map((user) => ({
      user_id: user.userId,
      username: user.username || 'Unknown',
      email: user.email || '',
      suspension_reason: user.banReason || 'No reason provided',
      suspended_at: user.bannedAt
        ? new Date(user.bannedAt).toISOString()
        : new Date().toISOString(),
      suspended_until: user.banExpiresAt ? new Date(user.banExpiresAt).toISOString() : 'Permanent',
      days_remaining: user.banExpiresAt
        ? Math.max(0, Math.ceil((user.banExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
        : -1,
      violation_count: user.violationCount || 0,
    }));
  } catch (error) {
    console.error('[AdminService] Failed to get suspended users:', error);
    return [];
  }
}

/**
 * Get user detail with violations and ban history
 */
export async function getUserDetail(
  userId: string,
  token?: string
): Promise<UserDetailResponse | null> {
  if (!token) {
    console.warn('[AdminService] No token provided for getUserDetail');
    return null;
  }

  try {
    return await apiRequest<UserDetailResponse>(`/admin/users/${userId}`, token);
  } catch (error) {
    console.error('[AdminService] Failed to get user detail:', error);
    return null;
  }
}

/**
 * Get user violations
 */
export async function getUserViolations(userId: string, token?: string): Promise<Violation[]> {
  if (!token) {
    console.warn('[AdminService] No token provided for getUserViolations');
    return [];
  }

  try {
    const detail = await getUserDetail(userId, token);
    return detail?.violations || [];
  } catch (error) {
    console.error('[AdminService] Failed to get user violations:', error);
    return [];
  }
}

/**
 * Ban a user
 */
export async function banUser(params: BanUserParams, token?: string): Promise<void> {
  if (!token) {
    throw new Error('Authentication required');
  }

  await apiRequest('/admin/users/ban', token, {
    method: 'POST',
    body: JSON.stringify({
      targetUserId: params.userId,
      banReason: params.reason,
      banDuration: params.duration || 0, // 0 = permanent
      banDurationUnit: params.durationUnit || 'days',
    }),
  });
}

/**
 * Check ban status for a user by userId (admin endpoint)
 */
export async function checkBanStatus(userId: string, token?: string): Promise<BanStatusResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/admin/users/${userId}/ban-status`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to check ban status');
  }

  const result = await response.json();
  return result.data || result;
}

/**
 * Check ban status for a user by username (for banned page)
 * This is a public endpoint that doesn't require authentication
 */
export async function checkBanStatusByUsername(username: string): Promise<BanStatusResponse> {
  try {
    const response = await fetch(
      `${API_URL}/users/ban-status?username=${encodeURIComponent(username)}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('[AdminService] Failed to check ban status by username:', response.status);
      // Return default banned status if API fails
      return {
        isBanned: true,
        username,
        banReason: 'Vi phạm quy định cộng đồng',
        banDurationDisplay: 'Không xác định',
        remainingTime: 'Không xác định',
        canAppeal: true,
      };
    }

    const result = await response.json();
    return result.data || result;
  } catch (error) {
    console.error('[AdminService] Error checking ban status by username:', error);
    // Return default banned status if API fails
    return {
      isBanned: true,
      username,
      banReason: 'Vi phạm quy định cộng đồng',
      banDurationDisplay: 'Không xác định',
      remainingTime: 'Không xác định',
      canAppeal: true,
    };
  }
}

/**
 * Check current user's ban status
 */
export async function checkMyBanStatus(token: string): Promise<BanStatusResponse> {
  return apiRequest<BanStatusResponse>('/users/me/ban-status', token);
}

/**
 * Submit an appeal for a banned user
 */
export async function submitAppeal(params: {
  userId: string;
  reason: string;
}): Promise<{ appealId: string }> {
  const response = await fetch(`${API_URL}/appeals/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: params.userId,
      reason: params.reason,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.error || error.message || 'Failed to submit appeal');
  }

  const result = await response.json();
  return result.data || result;
}

/**
 * Get appeals (admin only)
 */
export async function getAppeals(
  token: string,
  params: { status?: string; limit?: number; lastKey?: string } = {}
): Promise<{ appeals: Appeal[]; hasMore: boolean; lastKey?: string }> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.set('status', params.status);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.lastKey) queryParams.set('lastKey', params.lastKey);

  const query = queryParams.toString();
  const endpoint = `/admin/appeals${query ? `?${query}` : ''}`;

  return apiRequest(endpoint, token);
}

/**
 * Review an appeal (admin only)
 */
export async function reviewAppeal(
  appealId: string,
  action: 'approve' | 'reject',
  notes: string,
  token: string
): Promise<void> {
  await apiRequest(`/admin/appeals/${appealId}/review`, token, {
    method: 'POST',
    body: JSON.stringify({ action, notes }),
  });
}

/**
 * Unban a user
 */
export async function unbanUser(userId: string, reason?: string, token?: string): Promise<void> {
  if (!token) {
    throw new Error('Authentication required');
  }

  await apiRequest('/admin/users/unban', token, {
    method: 'POST',
    body: JSON.stringify({
      targetUserId: userId,
      unbanReason: reason || 'Admin decision',
    }),
  });
}

/**
 * Get reported posts
 */
export async function getReportedPosts(
  token: string,
  params: { status?: string; limit?: number; lastKey?: string } = {}
): Promise<{ reports: Report[]; hasMore: boolean; lastKey?: string }> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.set('status', params.status);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.lastKey) queryParams.set('lastKey', params.lastKey);

  const query = queryParams.toString();
  const endpoint = `/admin/posts/reported${query ? `?${query}` : ''}`;

  return apiRequest(endpoint, token);
}

/**
 * Review a reported post
 */
export async function reviewPost(
  postId: string,
  action: 'approve' | 'reject' | 'delete',
  notes: string,
  token: string
): Promise<void> {
  await apiRequest(`/admin/posts/${postId}/review`, token, {
    method: 'POST',
    body: JSON.stringify({ action, notes }),
  });
}

// ============ Comment Report Types ============

export interface CommentReport {
  reportId: string;
  commentId: string;
  postId: string;
  reporterId: string;
  reporterUsername?: string;
  reason: string;
  details?: string;
  status: ReportStatus;
  createdAt: string;
  commentContent?: string;
  commentAuthorId?: string;
  commentAuthorUsername?: string;
  reportCount?: number;
  preview?: string;
  severity?: 'critical' | 'high' | 'normal';
}

export interface CommentDetailResponse {
  comment: {
    commentId: string;
    postId: string;
    authorId: string;
    authorUsername: string;
    authorAvatarUrl?: string;
    content: string;
    status: string;
    reportCount: number;
    likeCount: number;
    replyCount: number;
    createdAt: number;
    hiddenAt?: number;
    hiddenReason?: string;
    // Moderation action info
    moderationAction?: string;
    moderationReason?: string;
    moderatedAt?: number;
    moderatedBy?: string;
  };
  post: {
    postId: string;
    authorId: string;
    authorUsername: string;
    title?: string;
    caption?: string;
  } | null;
  author: {
    userId: string;
    username: string;
    displayName?: string;
    email: string;
    avatarUrl?: string;
    isBanned: boolean;
    banReason?: string;
    violationCount: number;
  } | null;
  reports: {
    reportId: string;
    reporterId: string;
    reporterUsername?: string;
    reason: string;
    details?: string;
    status: string;
    createdAt: number;
  }[];
  reportSummary: {
    total: number;
    byReason: Record<string, number>;
    byStatus: Record<string, number>;
  };
  authorViolations: {
    violationId: string;
    type: string;
    reason: string;
    severity: string;
    createdAt: number;
    commentId?: string;
  }[];
}

export type CommentModerationAction =
  | 'warn'
  | 'hide_comment'
  | 'delete_comment'
  | 'ban_user'
  | 'dismiss';

export interface TakeCommentActionParams {
  action: CommentModerationAction;
  reason: string;
  banDuration?: number;
  banDurationUnit?: BanDurationUnit;
  notifyUser?: boolean;
}

// Post detail for moderation
export interface PostDetailResponse {
  post: {
    postId: string;
    authorId: string;
    authorUsername: string;
    authorAvatarUrl?: string;
    title?: string;
    caption?: string;
    imageUrls: string[];
    recipeId?: string;
    status: string;
    reportCount: number;
    likeCount: number;
    commentCount: number;
    createdAt: number;
    hiddenAt?: number;
    hiddenReason?: string;
    // Moderation action info
    moderationAction?: string;
    moderationReason?: string;
    moderatedAt?: number;
    moderatedBy?: string;
  };
  author: {
    userId: string;
    username: string;
    displayName?: string;
    email: string;
    avatarUrl?: string;
    isBanned: boolean;
    banReason?: string;
    violationCount: number;
  } | null;
  reports: {
    reportId: string;
    reporterId: string;
    reporterUsername?: string;
    reason: string;
    details?: string;
    createdAt: number;
  }[];
  reportSummary: {
    total: number;
    byReason: Record<string, number>;
  };
  authorViolations: {
    violationId: string;
    type: string;
    reason: string;
    severity: string;
    createdAt: number;
    postId?: string;
  }[];
}

/**
 * Get post detail with all reports for moderation
 */
export async function getPostDetail(postId: string, token: string): Promise<PostDetailResponse> {
  return apiRequest<PostDetailResponse>(`/admin/posts/${postId}`, token);
}

export type ModerationAction = 'warn' | 'delete_post' | 'hide_post' | 'ban_user' | 'dismiss';

export interface TakeActionParams {
  action: ModerationAction;
  reason: string;
  banDuration?: number;
  banDurationUnit?: BanDurationUnit;
  notifyUser?: boolean;
}

/**
 * Take moderation action on a post
 */
export async function takeAction(
  postId: string,
  params: TakeActionParams,
  token: string
): Promise<any> {
  return apiRequest(`/admin/posts/${postId}/action`, token, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Get admin activity log
 */
export async function getActivity(
  token: string,
  params: GetActivityParams = {}
): Promise<GetActivityResponse> {
  const queryParams = new URLSearchParams();
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.lastKey) queryParams.set('lastKey', params.lastKey);
  if (params.actionType) queryParams.set('actionType', params.actionType);

  const query = queryParams.toString();
  const endpoint = `/admin/activity${query ? `?${query}` : ''}`;

  return apiRequest<GetActivityResponse>(endpoint, token);
}

/**
 * Get report statistics
 */
export async function getReportStats(token: string): Promise<ReportStats> {
  return apiRequest<ReportStats>('/admin/reports/stats', token);
}

// ============ Comment Report API Functions ============

/**
 * Get reported comments
 */
export async function getReportedComments(
  token: string,
  params: { status?: string; limit?: number; lastKey?: string } = {}
): Promise<{ reports: CommentReport[]; hasMore: boolean; count: number }> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.set('status', params.status);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.lastKey) queryParams.set('lastKey', params.lastKey);

  const query = queryParams.toString();
  const endpoint = `/admin/comments/reported${query ? `?${query}` : ''}`;

  return apiRequest(endpoint, token);
}

/**
 * Get comment detail with all reports for moderation
 */
export async function getCommentDetail(
  commentId: string,
  token: string
): Promise<CommentDetailResponse> {
  return apiRequest<CommentDetailResponse>(`/admin/comments/${commentId}`, token);
}

/**
 * Take moderation action on a comment
 */
export async function takeCommentAction(
  commentId: string,
  params: TakeCommentActionParams,
  token: string
): Promise<any> {
  return apiRequest(`/admin/comments/${commentId}/action`, token, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============ Admin Service Object (for compatibility) ============

export const adminService = {
  async getStats(token: string): Promise<AdminStats> {
    const stats = await getDatabaseStats(token);
    return {
      totalUsers: stats.counts.total_users,
      totalPosts: stats.counts.total_posts,
      totalReports: stats.counts.total_violations,
      pendingReports: 0, // TODO: Get from reports API
    };
  },

  async getReports(status: ReportStatus | 'all', token: string): Promise<Report[]> {
    const result = await getReportedPosts(token, {
      status: status === 'all' ? undefined : status,
    });
    return result.reports || [];
  },

  async updateReportStatus(
    reportId: string,
    status: ReportStatus,
    notes: string,
    token: string
  ): Promise<void> {
    const action = status === 'resolved' ? 'approve' : 'reject';
    await reviewPost(reportId, action, notes, token);
  },

  async getUsers(token: string): Promise<User[]> {
    const result = await getUsers(token);
    return result.users;
  },

  banUser: async (params: BanUserParams, token?: string) => banUser(params, token),
  unbanUser: async (userId: string, reason?: string, token?: string) =>
    unbanUser(userId, reason, token),

  async getActivity(token: string, params: GetActivityParams = {}): Promise<ActivityLog[]> {
    const result = await getActivity(token, params);
    return result.activities;
  },
};

// ============ User Sync Types ============

export interface CognitoUserInfo {
  sub: string;
  username: string;
  email?: string;
}

export interface SyncUsersResult {
  message: string;
  dryRun: boolean;
  deleteCognitoOrphans: boolean;
  totalDynamoUsers: number;
  totalCognitoUsers: number;
  // Users in DynamoDB but not in Cognito
  orphanedDynamoUsers: string[];
  deletedDynamoUsers: string[];
  deletedDynamoRecords: number;
  // Users in Cognito but not in DynamoDB
  orphanedCognitoUsers: CognitoUserInfo[];
  deletedCognitoUsers: string[];
  deletedS3Objects: number;
  errors: string[];
  // Backward compatibility - computed fields
  orphanedUsers?: string[];
  deletedUsers?: string[];
  deletedRecords?: number;
}

/**
 * Sync users between Cognito and DynamoDB
 * Removes orphaned users from DynamoDB that no longer exist in Cognito
 * Optionally removes orphaned users from Cognito that don't exist in DynamoDB
 *
 * @param token - Admin token
 * @param options - Sync options
 * @param options.dryRun - If true, only report what would be deleted (default: true)
 * @param options.deleteS3 - If true, also delete S3 objects for orphaned users (default: false)
 * @param options.deleteCognitoOrphans - If true, delete users in Cognito but not in DynamoDB (default: false)
 */
export async function syncUsers(
  token: string,
  options: { dryRun?: boolean; deleteS3?: boolean; deleteCognitoOrphans?: boolean } = {}
): Promise<SyncUsersResult> {
  const result = await apiRequest<SyncUsersResult>('/admin/users/sync', token, {
    method: 'POST',
    body: JSON.stringify({
      dryRun: options.dryRun !== false, // Default to true for safety
      deleteS3: options.deleteS3 === true, // Default to false
      deleteCognitoOrphans: options.deleteCognitoOrphans === true, // Default to false
    }),
  });

  // Add backward compatibility fields
  result.orphanedUsers = [
    ...(result.orphanedDynamoUsers || []),
    ...(result.orphanedCognitoUsers || []).map((u) => u.username),
  ];
  result.deletedUsers = [
    ...(result.deletedDynamoUsers || []),
    ...(result.deletedCognitoUsers || []),
  ];
  result.deletedRecords = result.deletedDynamoRecords || 0;

  return result;
}

// ============ Detailed Stats Types ============

export type StatsPeriod = 'day' | 'week' | 'month';

export interface HourlyData {
  hour: number;
  count: number;
}

export interface DailyData {
  date: string;
  count: number;
}

export interface DetailedStats {
  period: StatsPeriod;
  timeRange: {
    start: string;
    end: string;
  };
  activeUsers: {
    total: number;
    hourly?: HourlyData[];
    daily?: DailyData[];
  };
  newUsers: {
    total: number;
    hourly?: HourlyData[];
    daily?: DailyData[];
  };
  posts: {
    total: number;
    hourly?: HourlyData[];
    daily?: DailyData[];
  };
  reports: {
    total: number;
    posts: number;
    comments: number;
    hourly?: HourlyData[];
    daily?: DailyData[];
  };
}

/**
 * Get detailed statistics with time-based filtering
 *
 * @param token - Admin token
 * @param period - Time period: 'day' | 'week' | 'month'
 */
export async function getDetailedStats(
  token: string,
  period: StatsPeriod = 'day',
  customDate?: string
): Promise<DetailedStats> {
  let url = `/admin/stats/detailed?period=${period}`;
  if (customDate) url += `&date=${customDate}`;
  return apiRequest<DetailedStats>(url, token);
}

// ============ Delete User Types ============

export interface DeleteUserStats {
  userProfile: boolean;
  cognitoUser: boolean;
  postsDeleted: number;
  commentsDeleted: number;
  reactionsDeleted: number;
  friendshipsDeleted: number;
  notificationsDeleted: number;
  filesDeleted: number;
  analyticsDeleted: number;
  totalItemsDeleted: number;
}

export interface DeleteUserResponse {
  message: string;
  userId: string;
  username: string;
  email: string;
  dryRun: boolean;
  cascade: boolean;
  reason: string;
  stats: DeleteUserStats;
}

/**
 * Delete user permanently (CASCADE DELETE)
 * Removes user from Cognito, DynamoDB, S3, and all related data
 *
 * @param userId - User ID to delete
 * @param reason - Reason for deletion
 * @param token - Admin token
 * @param dryRun - If true, only simulate deletion (default: false)
 */
export async function deleteUserPermanently(
  userId: string,
  reason: string,
  token: string,
  dryRun: boolean = false
): Promise<DeleteUserResponse> {
  const queryParams = new URLSearchParams({
    cascade: 'true',
    reason: reason,
  });
  if (dryRun) {
    queryParams.set('dryRun', 'true');
  }

  const response = await fetch(`${API_URL}/admin/users/${userId}?${queryParams}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.error?.message || error.message || `HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.data || result;
}
