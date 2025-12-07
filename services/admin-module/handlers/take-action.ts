/**
 * Take Action Handler
 *
 * Admin endpoint to take moderation action on a post.
 * Supports: warn, delete_post, ban_user
 *
 * POST /admin/posts/:postId/action
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId, getRequestIP } from '../middleware/admin-auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { BanService } from '../services/ban.service';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const banService = new BanService();
const auditLogService = new AuditLogService();

// Validation schema - Removed delete_post, only: dismiss, warn, hide_post, ban_user
const TakeActionSchema = z.object({
  action: z.enum(['warn', 'hide_post', 'ban_user', 'dismiss']),
  reason: z.string().max(500).optional().default(''),
  banDuration: z.number().min(0).optional(),
  banDurationUnit: z.enum(['minutes', 'hours', 'days']).optional(),
  notifyUser: z.boolean().optional().default(true),
});

// TTL constants
const HIDDEN_CONTENT_TTL_DAYS = 7; // Days before hidden content is auto-deleted

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);
    const ipAddress = getRequestIP(event);

    const postId = event.pathParameters?.postId;
    if (!postId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Post ID is required' }),
      };
    }

    // Parse and validate body
    const body = JSON.parse(event.body || '{}');
    const validationResult = TakeActionSchema.safeParse(body);

    if (!validationResult.success) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: 'Validation failed',
          details: validationResult.error.errors,
        }),
      };
    }

    const { action, banDuration, banDurationUnit, notifyUser } = validationResult.data;
    const reason = validationResult.data.reason || '';

    console.log('[TakeAction] Request', { correlationId, adminUserId, postId, action });

    // Get post to find author
    const postResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `POST#${postId}`, SK: 'METADATA' },
      })
    );

    if (!postResult.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Post not found' }),
      };
    }

    const post = postResult.Item;
    const authorId = post.authorId;
    const now = Date.now();
    const results: any = { postId, action, success: true };

    // Get author username for audit log
    let authorUsername = 'Unknown';
    try {
      const authorResult = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${authorId}`, SK: 'PROFILE' },
        })
      );
      if (authorResult.Item?.username) {
        authorUsername = authorResult.Item.username;
      }
    } catch (e) {
      console.warn('[TakeAction] Failed to get author username:', e);
    }

    // Create violation record ONLY if action is NOT dismiss
    // Dismiss means the report is invalid, so no violation should be recorded
    let violationId: string | null = null;
    if (action !== 'dismiss') {
      violationId = uuidv4();

      // Get post content for violation record
      const postContent = post.caption || post.title || '';
      const violationContent =
        postContent.length > 300 ? postContent.substring(0, 300) + '...' : postContent;

      // Get report count for this post
      let reportCount = 0;
      try {
        const reportResult = await dynamoDB.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `POST#${postId}`,
              ':sk': 'REPORT#',
            },
            Select: 'COUNT',
          })
        );
        reportCount = reportResult.Count || 0;
      } catch (e) {
        console.warn('[TakeAction] Failed to get report count:', e);
      }

      await dynamoDB.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${authorId}`,
            SK: `VIOLATION#${violationId}`,
            violationId,
            userId: authorId,
            postId,
            violationType: 'post',
            violationContent,
            reportCount,
            type: action,
            reason,
            severity: action === 'ban_user' ? 'high' : action === 'hide_post' ? 'medium' : 'low',
            adminUserId,
            createdAt: now,
            GSI1PK: `VIOLATION#${authorId}`,
            GSI1SK: `${now}`,
          },
        })
      );
      results.violationId = violationId;

      // Increment violationCount in user profile
      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${authorId}`, SK: 'PROFILE' },
          UpdateExpression: 'SET violationCount = if_not_exists(violationCount, :zero) + :one',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
          },
        })
      );
    }

    // Execute action
    switch (action) {
      case 'warn':
        // Send warning notification to user
        if (notifyUser) {
          // Get admin username
          let adminUsername = 'Quản trị viên';
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
              adminUsername = adminResult.Items[0].username;
            }
          } catch (e) {
            // Ignore
          }

          await createNotification(authorId, {
            type: 'WARNING',
            title: 'Cảnh báo vi phạm',
            message: `đã gửi cảnh báo: ${reason}`,
            postId,
            createdAt: now,
            metadata: { adminUsername, reason },
          });
        }
        // Update post status
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `POST#${postId}`, SK: 'METADATA' },
            UpdateExpression:
              'SET warningCount = if_not_exists(warningCount, :zero) + :one, lastWarningAt = :now, lastWarningReason = :reason',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':one': 1,
              ':now': now,
              ':reason': reason,
            },
          })
        );
        results.message = 'Warning sent to user';
        break;

      case 'hide_post': {
        // Calculate TTL: 7 days from now for auto-deletion if no appeal
        const hideTtl = Math.floor(now / 1000) + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60;

        // Get report count for notification
        let hideReportCount = 0;
        try {
          const reportResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `POST#${postId}`,
                ':sk': 'REPORT#',
              },
              Select: 'COUNT',
            })
          );
          hideReportCount = reportResult.Count || 0;
        } catch (e) {
          console.warn('[TakeAction] Failed to get report count for hide:', e);
        }

        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `POST#${postId}`, SK: 'METADATA' },
            UpdateExpression:
              'SET #status = :hidden, hiddenAt = :now, hiddenBy = :admin, hiddenReason = :reason, #ttl = :ttl, canAppeal = :canAppeal, appealDeadline = :deadline',
            ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':hidden': 'hidden',
              ':now': now,
              ':admin': adminUserId,
              ':reason': reason,
              ':ttl': hideTtl,
              ':canAppeal': true,
              ':deadline': now + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000,
            },
          })
        );

        if (notifyUser) {
          // Get admin username for notification
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

          // Send notification with appeal info
          await createContentHiddenNotification(authorId, {
            type: 'POST_HIDDEN',
            contentType: 'post',
            contentId: postId,
            action: 'hide',
            title: 'Bài viết bị ẩn',
            reason,
            reportCount: hideReportCount,
            adminUsername: hideAdminUsername,
            appealDeadline: now + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000,
            violationId: violationId || undefined,
            createdAt: now,
          });
        }
        results.message = 'Post hidden - User can appeal within 7 days';
        results.postStatus = 'hidden';
        results.appealDeadline = new Date(
          now + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        break;
      }

      case 'ban_user': {
        // Calculate ban expiry time
        let banExpiresAt: number | null = null;
        if (banDuration && banDuration > 0) {
          const multiplier =
            banDurationUnit === 'minutes' ? 60 * 1000 : banDurationUnit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
          banExpiresAt = now + banDuration * multiplier;
        }

        // TTL for hidden post: ban expiry + 7 days (or 90 days for permanent ban)
        const banPostTtl = banExpiresAt
          ? Math.floor(banExpiresAt / 1000) + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60
          : Math.floor(now / 1000) + 90 * 24 * 60 * 60;

        // Get report count for notification
        let banReportCount = 0;
        try {
          const reportResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `POST#${postId}`,
                ':sk': 'REPORT#',
              },
              Select: 'COUNT',
            })
          );
          banReportCount = reportResult.Count || 0;
        } catch (e) {
          console.warn('[TakeAction] Failed to get report count for ban:', e);
        }

        // Hide the post along with ban
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `POST#${postId}`, SK: 'METADATA' },
            UpdateExpression:
              'SET #status = :hidden, hiddenAt = :now, hiddenBy = :admin, hiddenReason = :reason, #ttl = :ttl, canAppeal = :canAppeal, appealDeadline = :deadline, hiddenDueToBan = :true',
            ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':hidden': 'hidden',
              ':now': now,
              ':admin': adminUserId,
              ':reason': reason,
              ':ttl': banPostTtl,
              ':canAppeal': true,
              ':deadline': banExpiresAt
                ? banExpiresAt + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000
                : now + 90 * 24 * 60 * 60 * 1000,
              ':true': true,
            },
          })
        );

        // Ban the user
        await banService.banUser({
          adminUserId,
          targetUserId: authorId,
          banReason: reason,
          banDuration: banDuration || 0,
          banDurationUnit: banDurationUnit || 'days',
        });

        // Get admin username for notification
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

        // Send notification about hidden post (user can appeal when ban expires)
        if (notifyUser) {
          await createContentHiddenNotification(authorId, {
            type: 'POST_HIDDEN_BAN',
            contentType: 'post',
            contentId: postId,
            action: 'ban',
            title: 'Bài viết bị ẩn do vi phạm',
            reason,
            reportCount: banReportCount,
            adminUsername: banAdminUsername,
            appealDeadline: banExpiresAt
              ? banExpiresAt + HIDDEN_CONTENT_TTL_DAYS * 24 * 60 * 60 * 1000
              : null,
            banExpiresAt,
            violationId: violationId || undefined,
            createdAt: now,
          });
        }

        results.message = 'User banned and post hidden';
        results.userBanned = true;
        results.postStatus = 'hidden';
        results.banDuration = banDuration || 0;
        results.banExpiresAt = banExpiresAt ? new Date(banExpiresAt).toISOString() : null;
        break;
      }


      case 'dismiss':
        // Clear reports, mark as action_taken (bỏ qua cũng là đã xử lý)
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `POST#${postId}`, SK: 'METADATA' },
            UpdateExpression:
              'SET reportCount = :zero, reviewedAt = :now, reviewedBy = :admin, reviewStatus = :action_taken',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':now': now,
              ':admin': adminUserId,
              ':action_taken': 'action_taken',
            },
          })
        );
        // Update all REPORT records status to action_taken
        await updateAllReportStatus(postId, 'dismissed', adminUserId, reason);
        results.message = 'Reports dismissed';
        break;
    }

    // For all actions except dismiss, also update report records to action_taken
    if (action !== 'dismiss') {
      await updateAllReportStatus(postId, 'action_taken', adminUserId, reason);
    }

    // Save moderation action info to post metadata for display
    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `POST#${postId}`, SK: 'METADATA' },
        UpdateExpression:
          'SET moderationAction = :action, moderationReason = :reason, moderatedAt = :now, moderatedBy = :admin',
        ExpressionAttributeValues: {
          ':action': action,
          ':reason': reason,
          ':now': now,
          ':admin': adminUserId,
        },
      })
    );

    // Map action to audit log action type
    const auditActionMap: Record<string, string> = {
      'warn': 'WARN_USER',
      'hide_post': 'HIDE_POST',
      'ban_user': 'BAN_USER',
      'dismiss': 'DISMISS',
    };

    // Log audit action
    await auditLogService.logAction({
      adminUserId,
      adminUsername: 'Admin',
      action: auditActionMap[action] as any,
      targetUserId: authorId,
      targetUsername: authorUsername,
      reason,
      ipAddress,
      userAgent: event.headers['User-Agent'],
      metadata: { postId, violationId },
    });

    console.log('[TakeAction] Completed', { correlationId, results });

    return createSuccessResponse(200, results, correlationId);
  } catch (error) {
    console.error('[TakeAction] Error:', error);
    return handleError(error, correlationId);
  }
}

async function createNotification(userId: string, notification: any) {
  const notificationId = uuidv4();
  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${notificationId}`,
        notificationId,
        userId,
        ...notification,
        isRead: false,
        GSI1PK: `NOTIFICATION#${userId}`,
        GSI1SK: `${notification.createdAt}#${notificationId}`,
      },
    })
  );
}

/**
 * Create notification for hidden content with appeal info
 * User can click to see violation details and submit appeal
 * 
 * Message format: Simple notification, click to see details
 */
async function createContentHiddenNotification(
  userId: string,
  data: {
    type: string;
    contentType: 'post' | 'comment';
    contentId: string;
    action: 'warn' | 'hide' | 'ban'; // Action type for message
    title: string;
    reason: string;
    reportCount: number;
    adminUsername: string;
    appealDeadline: number | null;
    banExpiresAt?: number | null;
    violationId?: string;
    createdAt: number;
  }
) {
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
        violationReason: data.reason,
        reportCount: data.reportCount,
        adminUsername: data.adminUsername,
        violationId: data.violationId,
        actionType: data.action,
        // Appeal info
        canAppeal: data.action !== 'warn', // Can appeal if hidden or banned, not for warnings
        appealDeadline: data.appealDeadline,
        banExpiresAt: data.banExpiresAt,
        // Timestamps
        createdAt: data.createdAt,
        ttl: ttl,
        // GSI for querying
        GSI1PK: `NOTIFICATION#${userId}`,
        GSI1SK: `${data.createdAt}#${notificationId}`,
      },
    })
  );
}

/**
 * Update all REPORT records for a post to mark them as processed
 */
async function updateAllReportStatus(
  postId: string,
  status: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();

  // Query all reports for this post
  const reportsResult = await dynamoDB.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :reportPrefix)',
      ExpressionAttributeValues: {
        ':pk': `POST#${postId}`,
        ':reportPrefix': 'REPORT#',
      },
    })
  );

  // Update each report record
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

  console.log(
    `[TakeAction] Updated ${reportsResult.Items?.length || 0} report records to status: ${status}`
  );
}
