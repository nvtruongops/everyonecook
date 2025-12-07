/**
 * Cleanup Inactive Users Handler
 *
 * Admin endpoint to cleanup inactive users.
 *
 * POST /admin/users/cleanup-inactive
 * Body: { dryRun: true, inactiveDays: 90 }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId, getRequestIP } from '../middleware/admin-auth';
import { validateInput, CleanupInactiveUsersSchema } from '../models/validation';
import { AuditLogService } from '../services/audit-log.service';
import { NotificationService } from '../services/notification.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const auditLogService = new AuditLogService();
const notificationService = new NotificationService();

const GRACE_PERIOD_DAYS = 7; // 7 days grace period before deletion

/**
 * Cleanup Inactive Users Handler
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // 1. Authorization check
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);
    const ipAddress = getRequestIP(event);

    // 2. Validate input
    const body = JSON.parse(event.body || '{}');
    const request = validateInput(CleanupInactiveUsersSchema, body);

    // 3. Calculate inactivity threshold
    const now = Date.now();
    const inactivityThreshold = now - (request.inactiveDays || 90) * 24 * 60 * 60 * 1000;

    // 4. Scan for inactive users
    const result = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk AND lastLoginAt < :threshold AND attribute_not_exists(ttl)',
        ExpressionAttributeValues: {
          ':sk': 'PROFILE',
          ':threshold': inactivityThreshold,
        },
      })
    );

    const inactiveUsers = result.Items || [];

    // 5. Process inactive users
    const processedUsers = [];

    for (const user of inactiveUsers) {
      if (request.dryRun) {
        // Dry run - just list users
        processedUsers.push({
          userId: user.userId,
          username: user.username,
          email: user.email,
          lastLoginAt: user.lastLoginAt,
          inactiveDays: Math.floor((now - user.lastLoginAt) / (24 * 60 * 60 * 1000)),
          action: 'would_set_ttl',
        });
      } else {
        // Set TTL for deletion
        const ttl = Math.floor((now + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) / 1000);

        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `USER#${user.userId}`,
              SK: 'PROFILE',
            },
            UpdateExpression: 'SET ttl = :ttl',
            ExpressionAttributeValues: {
              ':ttl': ttl,
            },
          })
        );

        // Send warning email
        if (user.email) {
          await notificationService.sendInactivityWarning(
            user.userId,
            user.email,
            GRACE_PERIOD_DAYS
          );
        }

        processedUsers.push({
          userId: user.userId,
          username: user.username,
          email: user.email,
          lastLoginAt: user.lastLoginAt,
          inactiveDays: Math.floor((now - user.lastLoginAt) / (24 * 60 * 60 * 1000)),
          action: 'ttl_set',
          deletionDate: new Date(ttl * 1000).toISOString(),
        });
      }
    }

    // 6. Log audit action (if not dry run)
    if (!request.dryRun && processedUsers.length > 0) {
      const adminProfile = await getProfile(adminUserId);
      const adminUsername = adminProfile?.username || 'Unknown Admin';

      await auditLogService.logAction({
        adminUserId,
        adminUsername,
        action: 'CLEANUP_INACTIVE',
        targetUserId: 'MULTIPLE',
        reason: `Cleanup inactive users (${request.inactiveDays} days)`,
        ipAddress,
        userAgent: event.headers['User-Agent'],
        metadata: {
          inactiveDays: request.inactiveDays,
          usersProcessed: processedUsers.length,
          gracePeriodDays: GRACE_PERIOD_DAYS,
        },
      });
    }

    // 7. Return success response
    return createSuccessResponse(
      200,
      {
        message: request.dryRun
          ? 'Dry run completed - no changes made'
          : 'Inactive users processed successfully',
        dryRun: request.dryRun,
        inactiveDays: request.inactiveDays,
        usersFound: inactiveUsers.length,
        usersProcessed: processedUsers.length,
        gracePeriodDays: GRACE_PERIOD_DAYS,
        users: processedUsers,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}

/**
 * Get Profile
 *
 * Helper to get user profile from DynamoDB.
 *
 * @param userId - User ID
 * @returns User profile or null
 */
async function getProfile(userId: string): Promise<any | null> {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
    })
  );

  return result.Item || null;
}
