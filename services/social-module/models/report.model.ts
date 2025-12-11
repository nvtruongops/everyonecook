/**
 * Report Model
 *
 * Data models and types for content reporting
 */

/**
 * Report reason enum
 */
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other';

/**
 * Report status enum
 */
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

/**
 * Report entity (DynamoDB)
 */
export interface Report {
  // Primary Keys
  PK: string; // "POST#{postId}" or "COMMENT#{commentId}"
  SK: string; // "REPORT#{userId}"

  // Report Data
  reportId: string;
  targetId: string; // postId or commentId
  targetType: 'post' | 'comment';
  reporterId: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;

  // Timestamps
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string; // Admin user ID

  // TTL for auto-cleanup (next Monday after 1 week)
  ttl?: number;
}

/**
 * Report request
 */
export interface ReportRequest {
  targetId: string;
  targetType: 'post' | 'comment';
  reason: ReportReason;
  details?: string;
}

/**
 * Report thresholds
 */
export const REPORT_THRESHOLDS = {
  ADMIN_REVIEW: 10, // Threshold 1: Notify admin
  AUTO_HIDE: 100, // Threshold 2: Auto-hide content
} as const;
