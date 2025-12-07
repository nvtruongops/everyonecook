/**
 * Get Banned Users Handler
 *
 * Admin endpoint to list banned users.
 *
 * GET /admin/users/banned?banType=all&limit=20&lastEvaluatedKey=...
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { validateInput, GetBannedUsersSchema } from '../models/validation';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Get Banned Users Handler
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // 1. Authorization check
    requireAdminRole(event);

    // 2. Validate query parameters
    const query = validateInput(GetBannedUsersSchema, {
      banType: event.queryStringParameters?.banType || 'all',
      limit: event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20,
      lastEvaluatedKey: event.queryStringParameters?.lastEvaluatedKey,
    });

    // 3. Build filter expression
    let filterExpression = 'SK = :sk AND isBanned = :banned';
    const expressionAttributeValues: Record<string, any> = {
      ':sk': 'PROFILE',
      ':banned': true,
    };

    // Add ban type filter
    if (query.banType === 'temporary') {
      filterExpression += ' AND banDuration > :zero';
      expressionAttributeValues[':zero'] = 0;
    } else if (query.banType === 'permanent') {
      filterExpression += ' AND banDuration = :zero';
      expressionAttributeValues[':zero'] = 0;
    }

    // 4. Scan for banned users
    const result = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: query.limit,
        ExclusiveStartKey: query.lastEvaluatedKey
          ? JSON.parse(Buffer.from(query.lastEvaluatedKey, 'base64').toString())
          : undefined,
      })
    );

    // 5. Format response with all required fields
    const bannedUsers = (result.Items || []).map((item) => ({
      userId: item.userId,
      username: item.username || 'Unknown',
      email: item.email || '',
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      isBanned: item.isBanned,
      banReason: item.banReason || 'No reason provided',
      bannedAt: item.bannedAt,
      bannedBy: item.bannedBy,
      banDuration: item.banDuration,
      banExpiresAt: item.banExpiresAt,
      banType: item.banDuration === 0 ? 'permanent' : 'temporary',
      violationCount: item.violationCount || 0,
      // Calculate days remaining for temporary bans
      daysRemaining:
        item.banExpiresAt && item.banDuration > 0
          ? Math.max(0, Math.ceil((item.banExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
          : null,
    }));

    // 6. Encode pagination token
    const lastEvaluatedKey = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    // 7. Return success response
    return createSuccessResponse(
      200,
      {
        users: bannedUsers,
        count: bannedUsers.length,
        lastEvaluatedKey,
        hasMore: !!result.LastEvaluatedKey,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
