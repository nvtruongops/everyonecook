/**
 * Content Moderation Models
 *
 * Data models and types for content moderation operations.
 */

import { z } from 'zod';

/**
 * Moderation Action Types
 */
export type ModerationAction = 'APPROVE' | 'REJECT' | 'DELETE' | 'RESTORE';

/**
 * Post Status Types
 */
export type PostStatus = 'active' | 'under_review' | 'hidden' | 'deleted';

/**
 * Report Reason Types
 */
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other';

/**
 * Reported Post Summary
 *
 * Summary of a post with reports for admin review.
 */
export interface ReportedPost {
  postId: string;
  authorId: string;
  authorUsername: string;
  title: string;
  caption: string;
  reportCount: number;
  pendingReportCount?: number;
  status: PostStatus;
  reportStatus?: 'pending' | 'action_taken' | 'dismissed';
  createdAt: string;
  hiddenAt?: string;
  hiddenReason?: string;
}

/**
 * Report Details
 *
 * Individual report information.
 */
export interface ReportDetails {
  reportId: string;
  reporterId: string;
  reporterUsername: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
}

/**
 * Review Post Request Schema
 *
 * Validates review post request payload.
 */
export const ReviewPostSchema = z.object({
  postId: z.string().min(1, 'Post ID is required').describe('Post ID to review'),

  action: z
    .enum(['APPROVE', 'REJECT'])
    .describe('Action to take: APPROVE (clear reports) or REJECT (hide post)'),

  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must not exceed 500 characters')
    .trim()
    .describe('Reason for the action'),
});

export type ReviewPostRequest = z.infer<typeof ReviewPostSchema>;

/**
 * Delete Post Request Schema
 *
 * Validates delete post request payload.
 */
export const DeletePostSchema = z.object({
  postId: z.string().min(1, 'Post ID is required').describe('Post ID to delete'),

  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must not exceed 500 characters')
    .trim()
    .describe('Reason for deletion'),

  notifyAuthor: z.boolean().optional().default(true).describe('Whether to notify the post author'),
});

export type DeletePostRequest = z.infer<typeof DeletePostSchema>;

/**
 * Restore Post Request Schema
 *
 * Validates restore post request payload.
 */
export const RestorePostSchema = z.object({
  postId: z.string().min(1, 'Post ID is required').describe('Post ID to restore'),

  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must not exceed 500 characters')
    .trim()
    .describe('Reason for restoration'),

  notifyAuthor: z.boolean().optional().default(true).describe('Whether to notify the post author'),
});

export type RestorePostRequest = z.infer<typeof RestorePostSchema>;

/**
 * Get Reported Posts Query Schema
 *
 * Validates query parameters for listing reported posts.
 */
export const GetReportedPostsSchema = z.object({
  minReports: z
    .number()
    .int('Min reports must be an integer')
    .min(1, 'Min reports must be at least 1')
    .optional()
    .default(10)
    .describe('Minimum number of reports (default: 10)'),

  status: z
    .enum(['all', 'under_review', 'hidden'])
    .optional()
    .default('all')
    .describe('Filter by post status'),

  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20)
    .describe('Number of results to return'),

  lastEvaluatedKey: z.string().optional().describe('Pagination token from previous request'),
});

export type GetReportedPostsQuery = z.infer<typeof GetReportedPostsSchema>;
