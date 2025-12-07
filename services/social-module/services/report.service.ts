/**
 * Report Service
 *
 * Business logic for content reporting and moderation
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';
import { Report, ReportRequest, REPORT_THRESHOLDS } from '../models/report.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});
// NOTE: SNS removed - using in-app notifications and admin dashboard instead

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Report Service Class
 */
export class ReportService {
  /**
   * Report content (post or comment)
   * Each user can only report once per target
   */
  async reportContent(
    userId: string,
    request: ReportRequest,
    reporterUsername?: string
  ): Promise<Report> {
    const { targetId, targetType, reason, details } = request;

    // 1. Check if user already reported this content
    const existingReport = await this.getUserReport(userId, targetId, targetType);

    if (existingReport) {
      throw new Error('You have already reported this content');
    }

    // 2. Get reporter username if not provided
    let username: string = reporterUsername || '';
    if (!username) {
      const userResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
          ProjectionExpression: 'username',
        })
      );
      username = userResult.Item?.username || 'Unknown';
    }

    // 3. Create report record
    const reportId = uuidv4();
    const now = new Date().toISOString();
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = `REPORT#${userId}`;

    const report: Report & { reporterUsername: string } = {
      PK,
      SK,
      reportId,
      targetId,
      targetType,
      reporterId: userId,
      reporterUsername: username,
      reason,
      details,
      status: 'pending',
      createdAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: report,
      })
    );

    // 3. Increment report count atomically
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET reportCount = if_not_exists(reportCount, :zero) + :inc',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':inc': 1,
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    const newReportCount = result.Attributes?.reportCount || 1;

    // 4. Check thresholds
    await this.checkReportThresholds(targetId, targetType, newReportCount);

    return report;
  }

  /**
   * Get user's report for a target
   */
  async getUserReport(
    userId: string,
    targetId: string,
    targetType: 'post' | 'comment'
  ): Promise<Report | null> {
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = `REPORT#${userId}`;

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
      })
    );

    return result.Item ? (result.Item as Report) : null;
  }

  /**
   * Check report thresholds and take action
   */
  private async checkReportThresholds(
    targetId: string,
    targetType: 'post' | 'comment',
    reportCount: number
  ): Promise<void> {
    // Get target content
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = 'METADATA';

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
      })
    );

    if (!result.Item) {
      return;
    }

    const content = result.Item;

    // Threshold 1: Notify admin (10 reports)
    if (reportCount === REPORT_THRESHOLDS.ADMIN_REVIEW) {
      await this.notifyAdminForReview(content, targetType, reportCount);

      // Update status to under_review
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK, SK },
          UpdateExpression: 'SET #status = :review',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':review': 'under_review',
          },
        })
      );
    }

    // Threshold 2: Auto-hide (100 reports)
    if (reportCount >= REPORT_THRESHOLDS.AUTO_HIDE) {
      await this.autoHideContent(content, targetType, reportCount);
    }
  }

  /**
   * Notify admin for review (Threshold 1: 10 reports)
   * NOTE: SNS removed - Admin views reports via dashboard at /admin/reports
   * Report stats are available via GET /admin/reports/stats API
   */
  private async notifyAdminForReview(
    content: any,
    targetType: 'post' | 'comment',
    reportCount: number
  ): Promise<void> {
    const targetId = targetType === 'post' ? content.postId : content.commentId;

    // Log for monitoring - Admin will see this in dashboard
    console.log(`[ReportService] Content requires review:`, {
      type: `${targetType}_review_required`,
      targetId,
      targetType,
      authorId: content.authorId,
      title: content.title || content.content?.substring(0, 50),
      reportCount,
      timestamp: new Date().toISOString(),
    });

    // NOTE: SNS notification removed
    // Admin can view pending reports via:
    // - Dashboard: /admin/reports
    // - API: GET /admin/reports/stats
    // - API: GET /admin/posts/reported
  }

  /**
   * Auto-hide content (Threshold 2: 100 reports)
   */
  private async autoHideContent(
    content: any,
    targetType: 'post' | 'comment',
    reportCount: number
  ): Promise<void> {
    const targetId = targetType === 'post' ? content.postId : content.commentId;
    const now = new Date().toISOString();
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = 'METADATA';

    // 1. Update status to hidden
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
        UpdateExpression: 'SET #status = :hidden, hiddenAt = :now, hiddenReason = :reason',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':hidden': 'hidden',
          ':now': now,
          ':reason': `Auto-hidden: ${reportCount} reports`,
        },
      })
    );

    // 2. Log urgent event - Admin will see in dashboard
    // NOTE: SNS notification removed - using dashboard instead
    console.log(`[ReportService] URGENT - Content auto-hidden:`, {
      type: `${targetType}_auto_hidden`,
      priority: 'urgent',
      targetId,
      targetType,
      authorId: content.authorId,
      title: content.title || content.content?.substring(0, 50),
      reportCount,
      hiddenAt: now,
      actions: ['ban_user', 'delete_content', 'restore_content', 'send_warning'],
    });

    // 3. Notify content author
    await this.notifyContentAuthor(content.authorId, targetId, targetType, reportCount);
  }

  /**
   * Notify content author that their content was hidden
   */
  private async notifyContentAuthor(
    authorId: string,
    targetId: string,
    targetType: 'post' | 'comment',
    reportCount: number
  ): Promise<void> {
    const message = {
      type: `${targetType}_hidden`,
      recipientId: authorId,
      resourceId: targetId,
      resourceType: targetType,
      metadata: {
        reportCount,
        reason: 'Community reports',
      },
      timestamp: new Date().toISOString(),
    };

    // Send via NotificationQueue (will be processed by notification worker)
    // Note: NOTIFICATION_QUEUE_URL should be set in environment
    const NOTIFICATION_QUEUE_URL = process.env.NOTIFICATION_QUEUE_URL || '';

    if (NOTIFICATION_QUEUE_URL) {
      try {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: NOTIFICATION_QUEUE_URL,
            MessageBody: JSON.stringify(message),
          })
        );
      } catch (error) {
        console.error('Failed to send author notification:', error);
      }
    }
  }
}
