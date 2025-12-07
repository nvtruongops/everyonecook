/**
 * Review Appeal Handler
 *
 * Admin endpoint to approve or reject a ban appeal.
 *
 * POST /admin/appeals/:appealId/review
 * Body: { action: 'approve' | 'reject', notes?: string }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { BanService } from '../services/ban.service';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const banService = new BanService();
const auditLogService = new AuditLogService();

// Validation schema
const ReviewAppealSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z
    .string()
    .min(5, 'Lý do phải có ít nhất 5 ký tự')
    .max(500, 'Lý do không được quá 500 ký tự'),
});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // Authorization check
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // Get appealId from path
    const appealId = event.pathParameters?.appealId;
    if (!appealId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Appeal ID is required' }),
      };
    }

    // Parse and validate body
    const body = JSON.parse(event.body || '{}');
    console.log('[ReviewAppeal] Request body:', JSON.stringify(body));
    
    const validationResult = ReviewAppealSchema.safeParse(body);

    if (!validationResult.success) {
      console.log('[ReviewAppeal] Validation failed:', JSON.stringify(validationResult.error.errors));
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Validation failed',
          details: validationResult.error.errors,
        }),
      };
    }

    const { action, notes } = validationResult.data;

    // Find the appeal
    const appealQuery = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: 'appealId = :appealId',
        ExpressionAttributeValues: {
          ':pk': 'APPEAL#pending',
          ':appealId': appealId,
        },
      })
    );

    if (!appealQuery.Items || appealQuery.Items.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Appeal not found or already reviewed' }),
      };
    }

    const appeal = appealQuery.Items[0];
    const now = Date.now();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Get admin username
    let adminUsername = 'Admin';
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

    // Update appeal status
    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: appeal.PK,
          SK: appeal.SK,
        },
        UpdateExpression: `
          SET #status = :status,
              reviewedAt = :now,
              reviewedBy = :admin,
              reviewedByUsername = :adminUsername,
              reviewNotes = :notes,
              GSI1PK = :newGsi1pk,
              GSI1SK = :newGsi1sk
        `,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': newStatus,
          ':now': now,
          ':admin': adminUserId,
          ':adminUsername': adminUsername,
          ':notes': notes,
          ':newGsi1pk': `APPEAL#${newStatus}`,
          ':newGsi1sk': `${now}#${appealId}`,
        },
      })
    );

    // Handle based on appeal type
    const appealType = appeal.appealType || 'ban';
    let contentRestored = false;

    if (action === 'approve') {
      try {
        if (appealType === 'ban') {
          // Ban appeal: unban the user
          await banService.unbanUser({
            targetUserId: appeal.userId,
            source: 'manual',
            adminUserId,
          });

          // Send notification to user about unban
          const notificationId = uuidv4();
          await dynamoDB.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                PK: `USER#${appeal.userId}`,
                SK: `NOTIFICATION#${notificationId}`,
                notificationId,
                userId: appeal.userId,
                type: 'APPEAL_APPROVED',
                title: 'Kháng cáo được chấp nhận',
                message: `Quản trị viên ${adminUsername} đã đồng ý mở khóa tài khoản của bạn. Lý do: ${notes}`,
                metadata: {
                  appealId,
                  adminUsername,
                  reviewNotes: notes,
                },
                isRead: false,
                createdAt: now,
                GSI1PK: `NOTIFICATION#${appeal.userId}`,
                GSI1SK: `${now}#${notificationId}`,
              },
            })
          );
        } else if (appealType === 'content') {
          // Content appeal: restore the hidden post/comment
          if (appeal.contentType === 'post' && appeal.contentId) {
            await dynamoDB.send(
              new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                  PK: `POST#${appeal.contentId}`,
                  SK: 'METADATA',
                },
                UpdateExpression: 'SET #status = :active, restoredAt = :now, restoredBy = :admin, restoredReason = :reason REMOVE #ttl, hiddenAt, hiddenBy, hiddenReason, canAppeal, appealDeadline',
                ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
                ExpressionAttributeValues: {
                  ':active': 'active',
                  ':now': now,
                  ':admin': adminUserId,
                  ':reason': notes,
                },
              })
            );
            contentRestored = true;
          } else if (appeal.contentType === 'comment' && appeal.contentId) {
            // Find and restore comment (scan without Limit since it applies before filter)
            const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
            let scanResult = await dynamoDB.send(
              new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'SK = :sk',
                ExpressionAttributeValues: {
                  ':sk': `COMMENT#${appeal.contentId}`,
                },
              })
            );
            let comment = scanResult.Items?.[0];
            
            // Continue scanning if not found (pagination)
            while (!comment && scanResult.LastEvaluatedKey) {
              scanResult = await dynamoDB.send(
                new ScanCommand({
                  TableName: TABLE_NAME,
                  FilterExpression: 'SK = :sk',
                  ExpressionAttributeValues: {
                    ':sk': `COMMENT#${appeal.contentId}`,
                  },
                  ExclusiveStartKey: scanResult.LastEvaluatedKey,
                })
              );
              comment = scanResult.Items?.[0];
            }
            if (comment) {
              await dynamoDB.send(
                new UpdateCommand({
                  TableName: TABLE_NAME,
                  Key: {
                    PK: comment.PK,
                    SK: comment.SK,
                  },
                  UpdateExpression: 'SET #status = :active, restoredAt = :now, restoredBy = :admin, restoredReason = :reason REMOVE #ttl, hiddenAt, hiddenBy, hiddenReason, canAppeal, appealDeadline',
                  ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
                  ExpressionAttributeValues: {
                    ':active': 'active',
                    ':now': now,
                    ':admin': adminUserId,
                    ':reason': notes,
                  },
                })
              );
              contentRestored = true;
            }
          }

          // Send notification about content restored
          const notificationId = uuidv4();
          const contentTypeVi = appeal.contentType === 'post' ? 'Bài viết' : 'Bình luận';
          await dynamoDB.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                PK: `USER#${appeal.userId}`,
                SK: `NOTIFICATION#${notificationId}`,
                notificationId,
                userId: appeal.userId,
                type: 'CONTENT_APPEAL_APPROVED',
                title: `${contentTypeVi} đã được khôi phục`,
                message: `Quản trị viên ${adminUsername} đã chấp nhận kháng cáo và khôi phục ${contentTypeVi.toLowerCase()} của bạn. Lý do: ${notes}`,
                metadata: {
                  appealId,
                  contentType: appeal.contentType,
                  contentId: appeal.contentId,
                  adminUsername,
                  reviewNotes: notes,
                },
                isRead: false,
                createdAt: now,
                GSI1PK: `NOTIFICATION#${appeal.userId}`,
                GSI1SK: `${now}#${notificationId}`,
              },
            })
          );
        }

        // Log audit action
        await auditLogService.logAction({
          adminUserId,
          adminUsername,
          action: appealType === 'ban' ? 'UNBAN_USER' : 'RESTORE_CONTENT',
          targetUserId: appeal.userId,
          targetUsername: appeal.username,
          reason: `Kháng cáo được chấp nhận: ${notes}`,
          ipAddress: event.requestContext.identity?.sourceIp || 'unknown',
          userAgent: event.headers['User-Agent'],
          metadata: {
            appealId,
            appealType,
            contentType: appeal.contentType,
            contentId: appeal.contentId,
            originalReason: appeal.banReason || appeal.hiddenReason,
            appealReason: appeal.reason,
          },
        });
      } catch (error) {
        console.error('Failed to process appeal approval', { appealId, appealType, error });
        // Don't fail the request - appeal is still approved
      }
    } else {
      // Rejected: send notification with reason
      const notificationId = uuidv4();
      const titleVi = appealType === 'ban' 
        ? 'Kháng cáo bị từ chối' 
        : `Kháng cáo ${appeal.contentType === 'post' ? 'bài viết' : 'bình luận'} bị từ chối`;
      
      await dynamoDB.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${appeal.userId}`,
            SK: `NOTIFICATION#${notificationId}`,
            notificationId,
            userId: appeal.userId,
            type: 'APPEAL_REJECTED',
            title: titleVi,
            message: `Quản trị viên ${adminUsername} đã từ chối kháng cáo của bạn. Lý do: ${notes}. Bạn có thể gửi kháng cáo mới nếu có thêm thông tin.`,
            metadata: {
              appealId,
              appealType,
              contentType: appeal.contentType,
              contentId: appeal.contentId,
              adminUsername,
              reviewNotes: notes,
            },
            isRead: false,
            createdAt: now,
            GSI1PK: `NOTIFICATION#${appeal.userId}`,
            GSI1SK: `${now}#${notificationId}`,
          },
        })
      );

      // Log reject action
      await auditLogService.logAction({
        adminUserId,
        adminUsername,
        action: 'REJECT_APPEAL',
        targetUserId: appeal.userId,
        targetUsername: appeal.username,
        reason: `Kháng cáo bị từ chối: ${notes}`,
        ipAddress: event.requestContext.identity?.sourceIp || 'unknown',
        userAgent: event.headers['User-Agent'],
        metadata: {
          appealId,
          appealType,
          contentType: appeal.contentType,
          contentId: appeal.contentId,
          originalReason: appeal.banReason || appeal.hiddenReason,
          appealReason: appeal.reason,
        },
      });
    }

    console.log('Appeal reviewed', { appealId, appealType, action, adminUserId, contentRestored });

    return createSuccessResponse(
      200,
      {
        message: `Appeal ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
        appealId,
        appealType,
        status: newStatus,
        userUnbanned: action === 'approve' && appealType === 'ban',
        contentRestored: action === 'approve' && appealType === 'content' ? contentRestored : undefined,
        contentType: appeal.contentType,
        contentId: appeal.contentId,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
