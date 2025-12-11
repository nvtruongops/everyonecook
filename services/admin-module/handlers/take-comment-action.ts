/**
 * Take Comment Action Handler
 *
 * API handler for taking moderation action on a reported comment.
 * POST /admin/comments/{commentId}/action
 *
 * Actions:
 * - warn: Send warning to user
 * - hide_comment: Hide the comment
 * - delete_comment: Delete the comment
 * - ban_user: Ban the comment author
 * - dismiss: Dismiss the reports
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { validateInput, BanDurationUnit } from '../models/validation';
import { BanService } from '../services/ban.service';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const banService = new BanService();

// Action schema - Removed delete_comment, only: dismiss, warn, hide_comment, ban_user
const TakeCommentActionSchema = z.object({
  action: z.enum(['warn', 'hide_comment', 'ban_user', 'dismiss']),
  reason: z.string().max(1000).optional().default(''),
  banDuration: z.number().optional(),
  banDurationUnit: z.enum(['minutes', 'hours', 'days']).optional(),
  notifyUser: z.boolean().optional().default(true),
});

// TTL constants
const HIDDEN_CONTENT_TTL_DAYS = 7;

/**
 * Take Comment Action Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    // 1. Require admin role
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // 2. Get commentId from path
    const commentId = event.pathParameters?.commentId;
    if (!commentId) {
      return createSuccessResponse(400, { error: 'Comment ID is required' }, correlationId);
    }

    // 3. Parse and validate body
    const body = JSON.parse(event.body || '{}');
    const validatedParams = validateInput(TakeCommentActionSchema, body);
    const params = {
      ...validatedParams,
      reason: validatedParams.reason || '',
    };

    console.log('[TakeCommentAction] Request', {
      correlationId,
      adminUserId,
      commentId,
      action: params.action,
    });

    // 4. Get comment - first try to get postId from report, then query directly
    let comment: any = null;
    let postId: string = '';

    // First check if there's a report that has postId
    const reportQuery = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :reportPrefix)',
        ExpressionAttributeValues: {
          ':pk': `COMMENT#${commentId}`,
          ':reportPrefix': 'REPORT#',
        },
        Limit: 1,
      })
    );

    if (reportQuery.Items && reportQuery.Items.length > 0 && reportQuery.Items[0].postId) {
      postId = reportQuery.Items[0].postId;
      // Query comment directly
      const commentResult = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: `COMMENT#${commentId}`,
          },
        })
      );
      comment = commentResult.Item;
    }

    // If not found, scan with pagination (increased limit for direct admin hide)
    if (!comment) {
      let lastKey: Record<string, any> | undefined;
      let scanCount = 0;
      const maxScans = 20; // Increased from 5 to handle larger tables

      console.log('[TakeCommentAction] Scanning for comment:', commentId);

      while (!comment && scanCount < maxScans) {
        const scanResult = await dynamoDB.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'SK = :sk',
            ExpressionAttributeValues: {
              ':sk': `COMMENT#${commentId}`,
            },
            ExclusiveStartKey: lastKey,
            Limit: 1000, // Scan more items per request
          })
        );

        scanCount++;
        console.log(`[TakeCommentAction] Scan ${scanCount}/${maxScans}, found ${scanResult.Items?.length || 0} items`);

        if (scanResult.Items && scanResult.Items.length > 0) {
          comment = scanResult.Items[0];
          postId = comment.PK?.replace('POST#', '') || '';
          console.log('[TakeCommentAction] Found comment in post:', postId);
        }

        lastKey = scanResult.LastEvaluatedKey;
        if (!lastKey) break;
      }
    }

    if (!comment) {
      return createSuccessResponse(404, { error: 'Comment not found' }, correlationId);
    }
    const now = new Date().toISOString();

    // Get author username for audit log
    let authorUsername = 'Unknown';
    if (comment.authorId) {
      try {
        const authorResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${comment.authorId}`, SK: 'PROFILE' },
          })
        );
        if (authorResult.Item?.username) {
          authorUsername = authorResult.Item.username;
        }
      } catch (e) {
        console.warn('[TakeCommentAction] Failed to get author username:', e);
      }
    }

    // 5. Execute action
    let result: any = { success: true, action: params.action };

    switch (params.action) {
      case 'warn':
        // Create warning notification for user
        if (comment.authorId && params.notifyUser) {
          // Get admin username
          let warnAdminUsername = 'Quản trị viên';
          try {
            const adminResult = await dynamoDB.send(
              new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND SK = :sk',
                ExpressionAttributeValues: {
                  ':pk': `USER#${adminUserId}`,
                  ':sk': 'PROFILE',
                },
                ProjectionExpression: 'username',
                Limit: 1,
              })
            );
            if (adminResult.Items?.[0]?.username) {
              warnAdminUsername = adminResult.Items[0].username;
            }
          } catch (e) {
            // Ignore
          }

          await createNotification(
            comment.authorId,
            'WARNING',
            'Cảnh báo vi phạm',
            `đã gửi cảnh báo về bình luận của bạn: ${params.reason}`,
            { commentId, reason: params.reason, adminUsername: warnAdminUsername }
          );
        }
        // Update report status
        await updateReportStatus(commentId, 'action_taken', adminUserId, params.reason);
        result.message = 'Warning sent to user';
        break;

      case 'hide_comment': {
        const hideNow = Date.now();
        const hideTtl = Math.floor(hideNow / 1000) + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60;
        const hideDeadline = hideNow + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000;

        // Get report count
        let hideReportCount = 0;
        try {
          const reportResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `COMMENT#${commentId}`,
                ':sk': 'REPORT#',
              },
              Select: 'COUNT',
            })
          );
          hideReportCount = reportResult.Count || 0;
        } catch (e) {
          console.warn('[TakeCommentAction] Failed to get report count:', e);
        }

        // Hide the comment with TTL
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${postId}`,
              SK: `COMMENT#${commentId}`,
            },
            UpdateExpression:
              'SET #status = :hidden, hiddenAt = :now, hiddenBy = :adminId, hiddenReason = :reason, #ttl = :ttl, canAppeal = :canAppeal, appealDeadline = :deadline, moderationAction = :modAction, moderationReason = :modReason, moderatedAt = :modAt, moderatedBy = :modBy',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#ttl': 'ttl',
            },
            ExpressionAttributeValues: {
              ':hidden': 'hidden',
              ':now': now,
              ':adminId': adminUserId,
              ':reason': params.reason,
              ':ttl': hideTtl,
              ':canAppeal': true,
              ':deadline': hideDeadline,
              ':modAction': 'hide_comment',
              ':modReason': params.reason,
              ':modAt': Date.now(),
              ':modBy': adminUserId,
            },
          })
        );

        // Create violation record
        const hideViolationContent =
          (comment.content || '').length > 300
            ? comment.content.substring(0, 300) + '...'
            : comment.content || '';
        const hideViolationId = await createViolation(
          comment.authorId,
          'comment_hidden',
          params.reason,
          'medium',
          commentId,
          hideViolationContent,
          hideReportCount
        );

        // Update report status
        await updateReportStatus(commentId, 'action_taken', adminUserId, params.reason);

        // Notify user with appeal info
        if (comment.authorId && params.notifyUser) {
          let hideAdminUsername = 'Quản trị viên';
          try {
            const adminResult = await dynamoDB.send(
              new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND SK = :sk',
                ExpressionAttributeValues: {
                  ':pk': `USER#${adminUserId}`,
                  ':sk': 'PROFILE',
                },
                ProjectionExpression: 'username',
                Limit: 1,
              })
            );
            if (adminResult.Items?.[0]?.username) {
              hideAdminUsername = adminResult.Items[0].username;
            }
          } catch (e) {
            // Ignore
          }

          await createContentHiddenNotification(comment.authorId, {
            type: 'COMMENT_HIDDEN',
            contentType: 'comment',
            contentId: commentId,
            postId,
            action: 'hide',
            title: 'Bình luận bị ẩn',
            reason: params.reason,
            reportCount: hideReportCount,
            adminUsername: hideAdminUsername,
            appealDeadline: hideDeadline,
            violationId: hideViolationId,
            createdAt: hideNow,
          });
        }
        result.message = 'Comment hidden - User can appeal within 7 days';
        result.appealDeadline = new Date(hideDeadline).toISOString();
        break;
      }

      case 'ban_user': {
        if (!comment.authorId) {
          return createSuccessResponse(400, { error: 'Comment has no author' }, correlationId);
        }

        const banNow = Date.now();

        // Calculate ban expiry
        let banExpiresAt: number | null = null;
        if (params.banDuration && params.banDuration > 0) {
          const multiplier =
            params.banDurationUnit === 'minutes'
              ? 60 * 1000
              : params.banDurationUnit === 'hours'
                ? 60 * 60 * 1000
                : 24 * 60 * 60 * 1000;
          banExpiresAt = banNow + params.banDuration * multiplier;
        }

        // TTL for hidden comment: ban expiry + 7 days
        const banTtl = banExpiresAt
          ? Math.floor(banExpiresAt / 1000) + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60
          : Math.floor(banNow / 1000) + 90 * 24 * 60 * 60;
        const banDeadline = banExpiresAt
          ? banExpiresAt + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000
          : null;

        // Get report count
        let banReportCount = 0;
        try {
          const reportResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `COMMENT#${commentId}`,
                ':sk': 'REPORT#',
              },
              Select: 'COUNT',
            })
          );
          banReportCount = reportResult.Count || 0;
        } catch (e) {
          console.warn('[TakeCommentAction] Failed to get report count:', e);
        }

        // Hide the comment with TTL
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${postId}`,
              SK: `COMMENT#${commentId}`,
            },
            UpdateExpression:
              'SET #status = :hidden, hiddenAt = :now, hiddenReason = :reason, #ttl = :ttl, canAppeal = :canAppeal, appealDeadline = :deadline, hiddenDueToBan = :true, moderationAction = :modAction, moderationReason = :modReason, moderatedAt = :modAt, moderatedBy = :modBy',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#ttl': 'ttl',
            },
            ExpressionAttributeValues: {
              ':hidden': 'hidden',
              ':now': now,
              ':reason': params.reason,
              ':ttl': banTtl,
              ':canAppeal': true,
              ':deadline': banDeadline,
              ':true': true,
              ':modAction': 'ban_user',
              ':modReason': params.reason,
              ':modAt': Date.now(),
              ':modBy': adminUserId,
            },
          })
        );

        // Ban the user
        await banService.banUser({
          adminUserId,
          targetUserId: comment.authorId,
          banReason: params.reason,
          banDuration: params.banDuration || 0,
          banDurationUnit: (params.banDurationUnit as BanDurationUnit) || 'days',
        });

        // Create violation record
        const banViolationContent =
          (comment.content || '').length > 300
            ? comment.content.substring(0, 300) + '...'
            : comment.content || '';
        const banViolationId = await createViolation(
          comment.authorId,
          'banned',
          params.reason,
          'high',
          commentId,
          banViolationContent,
          banReportCount
        );

        // Update report status
        await updateReportStatus(commentId, 'action_taken', adminUserId, params.reason);

        // Send notification about hidden comment
        if (params.notifyUser) {
          let banAdminUsername = 'Quản trị viên';
          try {
            const adminResult = await dynamoDB.send(
              new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND SK = :sk',
                ExpressionAttributeValues: {
                  ':pk': `USER#${adminUserId}`,
                  ':sk': 'PROFILE',
                },
                ProjectionExpression: 'username',
                Limit: 1,
              })
            );
            if (adminResult.Items?.[0]?.username) {
              banAdminUsername = adminResult.Items[0].username;
            }
          } catch (e) {
            // Ignore
          }

          await createContentHiddenNotification(comment.authorId, {
            type: 'COMMENT_HIDDEN_BAN',
            contentType: 'comment',
            contentId: commentId,
            postId,
            action: 'ban',
            title: 'Bình luận bị ẩn do vi phạm',
            reason: params.reason,
            reportCount: banReportCount,
            adminUsername: banAdminUsername,
            appealDeadline: banDeadline,
            banExpiresAt,
            violationId: banViolationId,
            createdAt: banNow,
          });
        }

        result.message = 'User banned and comment hidden';
        result.banExpiresAt = banExpiresAt ? new Date(banExpiresAt).toISOString() : null;
        break;
      }

      case 'dismiss':
        // Dismiss all reports for this comment (cũng tính là đã xử lý)
        await updateReportStatus(commentId, 'action_taken', adminUserId, params.reason);
        result.message = 'Reports dismissed';
        break;
    }

    // 6. Log admin action
    await logAdminAction(adminUserId, params.action, commentId, comment.authorId, authorUsername, params.reason);

    console.log('[TakeCommentAction] Completed', {
      correlationId,
      commentId,
      action: params.action,
      result,
    });

    return createSuccessResponse(200, result, correlationId);
  } catch (error) {
    console.error('[TakeCommentAction] Error:', error);
    return handleError(error, correlationId);
  }
}

/**
 * Update all report statuses for a comment
 */
async function updateReportStatus(
  commentId: string,
  status: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();

  // Get all reports for this comment
  const reportsResult = await dynamoDB.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :reportPrefix)',
      ExpressionAttributeValues: {
        ':pk': `COMMENT#${commentId}`,
        ':reportPrefix': 'REPORT#',
      },
    })
  );

  // Update each report
  for (const report of reportsResult.Items || []) {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: report.PK,
          SK: report.SK,
        },
        UpdateExpression:
          'SET #status = :status, reviewedAt = :now, reviewedBy = :adminId, reviewNotes = :reason',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':now': now,
          ':adminId': adminUserId,
          ':reason': reason,
        },
      })
    );
  }
}

/**
 * Create a notification for a user
 */
async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  metadata: Record<string, any>
): Promise<void> {
  const notificationId = uuidv4();
  const now = new Date().toISOString();

  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${notificationId}`,
        notificationId,
        userId,
        type,
        title,
        message,
        metadata,
        isRead: false,
        createdAt: now,
        entityType: 'NOTIFICATION',
      },
    })
  );
}

/**
 * Create a violation record for a user
 * Returns violationId for reference
 */
async function createViolation(
  userId: string,
  type: string,
  reason: string,
  severity: string,
  commentId?: string,
  violationContent?: string,
  reportCount?: number
): Promise<string> {
  const violationId = uuidv4();
  const now = Date.now();

  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `VIOLATION#${violationId}`,
        violationId,
        userId,
        type,
        reason,
        severity,
        commentId,
        violationType: 'comment',
        violationContent,
        reportCount: reportCount || 0,
        createdAt: now,
        entityType: 'VIOLATION',
        GSI1PK: `VIOLATION#${userId}`,
        GSI1SK: `${now}`,
      },
    })
  );

  // Increment violation count
  await dynamoDB.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
      UpdateExpression: 'ADD violationCount :one',
      ExpressionAttributeValues: {
        ':one': 1,
      },
    })
  );

  return violationId;
}

/**
 * Create notification for hidden content with appeal info
 * Simple message format, click to see details
 */
async function createContentHiddenNotification(
  userId: string,
  data: {
    type: string;
    contentType: 'post' | 'comment';
    contentId: string;
    postId?: string;
    action: 'warn' | 'hide' | 'ban';
    title: string;
    reason: string;
    reportCount: number;
    adminUsername: string;
    appealDeadline: number | null;
    banExpiresAt?: number | null;
    violationId?: string;
    createdAt: number;
  }
): Promise<void> {
  const notificationId = uuidv4();
  const ttl = data.appealDeadline
    ? Math.floor(data.appealDeadline / 1000) + 7 * 24 * 60 * 60
    : Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

  // Simple message format
  const contentTypeVi = data.contentType === 'post' ? 'Bài viết' : 'Bình luận';
  const actionVi = data.action === 'warn' ? 'bị cảnh báo' : data.action === 'hide' ? 'đã bị ẩn' : 'đã bị ẩn do vi phạm';
  const simpleMessage = `${contentTypeVi} của bạn ${actionVi} vì: ${data.reason}. Ấn để xem chi tiết.`;

  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${notificationId}`,
        notificationId,
        userId,
        type: data.type,
        title: data.title,
        message: simpleMessage,
        isRead: false,
        // Content info for viewing details and appeal
        contentType: data.contentType,
        contentId: data.contentId,
        postId: data.postId,
        violationReason: data.reason,
        reportCount: data.reportCount,
        adminUsername: data.adminUsername,
        violationId: data.violationId,
        actionType: data.action,
        // Appeal info
        canAppeal: data.action !== 'warn',
        appealDeadline: data.appealDeadline,
        banExpiresAt: data.banExpiresAt,
        // Timestamps
        createdAt: new Date(data.createdAt).toISOString(),
        ttl,
        entityType: 'NOTIFICATION',
      },
    })
  );
}

/**
 * Log admin action for audit trail
 */
async function logAdminAction(
  adminUserId: string,
  action: string,
  commentId: string,
  targetUserId?: string,
  targetUsername?: string,
  reason?: string
): Promise<void> {
  const actionId = uuidv4();
  const now = new Date().toISOString();

  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ADMIN_ACTION#${actionId}`,
        SK: `ADMIN_ACTION#${actionId}`,
        actionId,
        action: `COMMENT_${action.toUpperCase()}`,
        adminUserId,
        targetCommentId: commentId,
        targetUserId,
        targetUsername,
        reason,
        createdAt: now,
        timestamp: Date.now(),
        entityType: 'ADMIN_ACTION',
      },
    })
  );
}
