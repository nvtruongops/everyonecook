/**
 * Check Ban Status Handler
 *
 * Public endpoint to check if a user is banned.
 * Returns ban details if banned, used for login flow.
 *
 * GET /admin/users/:userId/ban-status
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

export interface BanStatusResponse {
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  banExpiresAt?: number | null;
  banDurationDisplay?: string;
  remainingTime?: string;
  canAppeal: boolean;
}

/**
 * Calculate remaining ban time
 */
function calculateRemainingTime(banExpiresAt: number | null): string {
  if (!banExpiresAt) return 'Vĩnh viễn';

  const now = Date.now();
  const remaining = banExpiresAt - now;

  if (remaining <= 0) return 'Đã hết hạn';

  const minutes = Math.floor(remaining / (60 * 1000));
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));

  if (days > 0) {
    const remainingHours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days} ngày ${remainingHours} giờ`;
  }
  if (hours > 0) {
    const remainingMinutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours} giờ ${remainingMinutes} phút`;
  }
  return `${minutes} phút`;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // Get userId from path or JWT token (for /users/me/ban-status)
    let userId = event.pathParameters?.userId;

    // If no userId in path, get from JWT token (for /users/me/ban-status endpoint)
    if (!userId) {
      userId = event.requestContext.authorizer?.claims?.sub;
    }

    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Get user profile
    const result = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
        ProjectionExpression: 'isBanned, banReason, bannedAt, banExpiresAt, banDurationDisplay',
      })
    );

    const profile = result.Item;

    if (!profile) {
      return createSuccessResponse(
        200,
        {
          isBanned: false,
          canAppeal: false,
        },
        correlationId
      );
    }

    // Check if ban has expired
    if (profile.isBanned && profile.banExpiresAt && profile.banExpiresAt < Date.now()) {
      // Ban has expired - should be auto-unbanned by scheduler
      // Return as not banned for now
      return createSuccessResponse(
        200,
        {
          isBanned: false,
          canAppeal: false,
        },
        correlationId
      );
    }

    const response: BanStatusResponse = {
      isBanned: profile.isBanned || false,
      canAppeal: profile.isBanned || false,
    };

    if (profile.isBanned) {
      response.banReason = profile.banReason;
      response.bannedAt = profile.bannedAt;
      response.banExpiresAt = profile.banExpiresAt;
      response.banDurationDisplay = profile.banDurationDisplay || 'Không xác định';
      response.remainingTime = calculateRemainingTime(profile.banExpiresAt);
    }

    return createSuccessResponse(200, response, correlationId);
  } catch (error) {
    return handleError(error, correlationId);
  }
}
