/**
 * Moderation Service
 *
 * Handles content moderation operations including post review, deletion, and restoration.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { ReportedPost, ReportDetails, PostStatus, ModerationAction } from '../models/moderation';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

export class ModerationServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'MODERATION_ERROR') {
    super(message);
    this.name = 'ModerationServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ModerationService {
  /**
   * Get Reported Posts
   *
   * Retrieves posts with report count >= threshold, sorted by report count DESC.
   *
   * @param minReports - Minimum number of reports (default: 10)
   * @param status - Filter by post status
   * @param limit - Maximum number of results
   * @returns List of reported posts
   */
  async getReportedPosts(
    minReports: number = 1,
    status: 'all' | 'under_review' | 'hidden' = 'all',
    limit: number = 20
  ): Promise<ReportedPost[]> {
    try {
      // Scan for all post reports (PK starts with POST# and SK starts with REPORT#)
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      const reportResult = await dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(PK, :postPrefix) AND begins_with(SK, :reportPrefix)',
          ExpressionAttributeValues: {
            ':postPrefix': 'POST#',
            ':reportPrefix': 'REPORT#',
          },
          ProjectionExpression: 'PK, SK, reportId, reporterId, reason, #s, createdAt',
          ExpressionAttributeNames: { '#s': 'status' },
        })
      );

      const reports = reportResult.Items || [];
      console.log('[ModerationService] Found reports:', reports.length);

      // Group reports by postId and count pending
      const postReportMap = new Map<string, { reports: any[]; pendingCount: number }>();

      for (const report of reports) {
        const postId = report.PK.replace('POST#', '');
        if (!postReportMap.has(postId)) {
          postReportMap.set(postId, { reports: [], pendingCount: 0 });
        }
        const entry = postReportMap.get(postId)!;
        entry.reports.push(report);
        if (report.status === 'pending') {
          entry.pendingCount++;
        }
      }

      // Get post details for each reported post
      const reportedPosts: ReportedPost[] = [];

      for (const [postId, data] of postReportMap.entries()) {
        // Skip if no pending reports and status filter is not 'all'
        if (status !== 'all' && data.pendingCount === 0) continue;
        if (data.reports.length < minReports) continue;

        // Get post metadata
        const postResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `POST#${postId}`, SK: 'METADATA' },
          })
        );

        const post = postResult.Item;
        if (!post) continue;

        // Filter by post status if specified
        if (status !== 'all' && post.status !== status) continue;

        // Get author username if not stored in post
        let authorUsername = post.authorUsername;
        if (!authorUsername && post.authorId) {
          const userResult = await dynamoDB.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: { PK: `USER#${post.authorId}`, SK: 'PROFILE' },
              ProjectionExpression: 'username',
            })
          );
          authorUsername = userResult.Item?.username || 'Unknown';
        }

        // Determine report status based on pending reports count
        const hasPendingReports = data.pendingCount > 0;

        reportedPosts.push({
          postId,
          authorId: post.authorId,
          authorUsername: authorUsername || 'Unknown',
          title: post.title,
          caption: post.caption,
          reportCount: data.reports.length,
          pendingReportCount: data.pendingCount,
          status: post.status || 'active',
          reportStatus: hasPendingReports ? 'pending' : 'action_taken',
          createdAt: post.createdAt,
          hiddenAt: post.hiddenAt,
          hiddenReason: post.hiddenReason,
        });
      }

      // Sort by reportCount DESC
      reportedPosts.sort((a, b) => b.reportCount - a.reportCount);

      console.log('[ModerationService] Reported posts:', reportedPosts.length);

      return reportedPosts.slice(0, limit);
    } catch (error) {
      console.error('Error getting reported posts:', error);
      throw new ModerationServiceError('Failed to retrieve reported posts');
    }
  }

  /**
   * Get Post Reports
   *
   * Retrieves all reports for a specific post.
   *
   * @param postId - Post ID
   * @returns List of report details
   */
  async getPostReports(postId: string): Promise<ReportDetails[]> {
    try {
      const result = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :report)',
          ExpressionAttributeValues: {
            ':pk': `POST#${postId}`,
            ':report': 'REPORT#',
          },
        })
      );

      return (result.Items || []).map((item: any) => ({
        reportId: item.reportId,
        reporterId: item.reporterId,
        reporterUsername: item.reporterUsername || 'Unknown',
        reason: item.reason,
        details: item.details,
        createdAt: item.createdAt,
      }));
    } catch (error) {
      console.error('Error getting post reports:', error);
      throw new ModerationServiceError('Failed to retrieve post reports');
    }
  }

  /**
   * Review Post
   *
   * Admin reviews a reported post and takes action (APPROVE or REJECT).
   *
   * @param postId - Post ID
   * @param action - Action to take (APPROVE or REJECT)
   * @param adminId - Admin user ID
   * @param reason - Reason for the action
   * @returns Updated post status
   */
  async reviewPost(
    postId: string,
    action: 'APPROVE' | 'REJECT',
    adminId: string,
    reason: string
  ): Promise<{ postId: string; status: PostStatus; action: ModerationAction }> {
    try {
      // Get current post
      const post = await this.getPost(postId);
      if (!post) {
        throw new ModerationServiceError('Post not found', 404, 'POST_NOT_FOUND');
      }

      const now = new Date().toISOString();

      if (action === 'APPROVE') {
        // Clear reports and set status to active
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${postId}`,
              SK: 'METADATA',
            },
            UpdateExpression:
              'SET reportCount = :zero, #status = :active, reviewedAt = :now, reviewedBy = :adminId, reviewReason = :reason REMOVE hiddenAt, hiddenReason',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':zero': 0,
              ':active': 'active',
              ':now': now,
              ':adminId': adminId,
              ':reason': reason,
            },
          })
        );

        console.log('Post approved', { postId, adminId, reason });

        return {
          postId,
          status: 'active',
          action: 'APPROVE',
        };
      } else {
        // REJECT: Hide post
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${postId}`,
              SK: 'METADATA',
            },
            UpdateExpression:
              'SET #status = :hidden, hiddenAt = :now, hiddenReason = :reason, reviewedAt = :now, reviewedBy = :adminId',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':hidden': 'hidden',
              ':now': now,
              ':reason': reason,
              ':adminId': adminId,
            },
          })
        );

        console.log('Post rejected and hidden', { postId, adminId, reason });

        return {
          postId,
          status: 'hidden',
          action: 'REJECT',
        };
      }
    } catch (error) {
      if (error instanceof ModerationServiceError) {
        throw error;
      }
      console.error('Error reviewing post:', error);
      throw new ModerationServiceError('Failed to review post');
    }
  }

  /**
   * Delete Post
   *
   * Soft delete a post (set status to 'deleted', keep data for audit).
   *
   * @param postId - Post ID
   * @param adminId - Admin user ID
   * @param reason - Reason for deletion
   * @returns Deletion confirmation
   */
  async deletePost(
    postId: string,
    adminId: string,
    reason: string
  ): Promise<{ postId: string; status: PostStatus }> {
    try {
      // Get current post
      const post = await this.getPost(postId);
      if (!post) {
        throw new ModerationServiceError('Post not found', 404, 'POST_NOT_FOUND');
      }

      const now = new Date().toISOString();

      // Soft delete: Set status to 'deleted'
      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: 'METADATA',
          },
          UpdateExpression:
            'SET #status = :deleted, deletedAt = :now, deletedBy = :adminId, deletionReason = :reason',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':deleted': 'deleted',
            ':now': now,
            ':adminId': adminId,
            ':reason': reason,
          },
        })
      );

      console.log('Post deleted', { postId, adminId, reason });

      // TODO: Queue S3 image deletion (async via SQS)
      // This would be implemented in Phase 4 with ImageProcessingQueue

      return {
        postId,
        status: 'deleted',
      };
    } catch (error) {
      if (error instanceof ModerationServiceError) {
        throw error;
      }
      console.error('Error deleting post:', error);
      throw new ModerationServiceError('Failed to delete post');
    }
  }

  /**
   * Restore Post
   *
   * Restore a hidden or deleted post.
   *
   * @param postId - Post ID
   * @param adminId - Admin user ID
   * @param reason - Reason for restoration
   * @returns Restoration confirmation
   */
  async restorePost(
    postId: string,
    adminId: string,
    reason: string
  ): Promise<{ postId: string; status: PostStatus }> {
    try {
      // Get current post
      const post = await this.getPost(postId);
      if (!post) {
        throw new ModerationServiceError('Post not found', 404, 'POST_NOT_FOUND');
      }

      if (post.status === 'active') {
        throw new ModerationServiceError('Post is already active', 400, 'POST_ALREADY_ACTIVE');
      }

      const now = new Date().toISOString();

      // Restore post: Set status to 'active'
      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: 'METADATA',
          },
          UpdateExpression:
            'SET #status = :active, restoredAt = :now, restoredBy = :adminId, restorationReason = :reason REMOVE hiddenAt, hiddenReason, deletedAt, deletedBy, deletionReason',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':active': 'active',
            ':now': now,
            ':adminId': adminId,
            ':reason': reason,
          },
        })
      );

      console.log('Post restored', { postId, adminId, reason });

      return {
        postId,
        status: 'active',
      };
    } catch (error) {
      if (error instanceof ModerationServiceError) {
        throw error;
      }
      console.error('Error restoring post:', error);
      throw new ModerationServiceError('Failed to restore post');
    }
  }

  /**
   * Get Post
   *
   * Retrieves a post by ID.
   *
   * @param postId - Post ID
   * @returns Post data or null if not found
   */
  private async getPost(postId: string): Promise<any | null> {
    try {
      const result = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: 'METADATA',
          },
        })
      );

      return result.Item || null;
    } catch (error) {
      console.error('Error getting post:', error);
      throw new ModerationServiceError('Failed to retrieve post');
    }
  }
}
