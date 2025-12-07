/**
 * Ban User Handler
 *
 * Admin endpoint to ban a user.
 *
 * POST /admin/users/ban
 * Body: { targetUserId, banReason, banDuration }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId, getRequestIP } from '../middleware/admin-auth';
import { checkRateLimit } from '../middleware/rate-limit';
import { validateInput, BanUserSchema } from '../models/validation';
import { BanService } from '../services/ban.service';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const banService = new BanService();
const auditLogService = new AuditLogService();

/**
 * Ban User Handler
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

    // 2. Rate limiting check
    await checkRateLimit(adminUserId);

    // 3. Validate input
    const body = JSON.parse(event.body || '{}');
    const request = validateInput(BanUserSchema, body);

    // 4. Get admin username
    const adminProfile = await getProfile(adminUserId);
    const adminUsername = adminProfile?.username || 'Unknown Admin';

    // 5. Get target user profile
    const targetProfile = await getProfile(request.targetUserId);
    const targetUsername = targetProfile?.username || 'Unknown User';

    // 6. Ban user (also creates violation record internally)
    await banService.banUser({
      adminUserId,
      targetUserId: request.targetUserId,
      banReason: request.banReason,
      banDuration: request.banDuration,
      banDurationUnit: request.banDurationUnit,
    });

    // 7. Log audit action
    await auditLogService.logAction({
      adminUserId,
      adminUsername,
      action: 'BAN_USER',
      targetUserId: request.targetUserId,
      targetUsername,
      reason: request.banReason,
      ipAddress,
      userAgent: event.headers['User-Agent'],
      metadata: {
        banDuration: request.banDuration,
        banType: request.banDuration === 0 ? 'permanent' : 'temporary',
      },
    });

    // 8. No notification for ban - user will see ban page when they try to access the app
    // User is immediately logged out via Cognito disable

    // 9. Return success response
    return createSuccessResponse(
      200,
      {
        message: 'User banned successfully',
        userId: request.targetUserId,
        banType: request.banDuration === 0 ? 'permanent' : 'temporary',
        banDuration: request.banDuration,
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
