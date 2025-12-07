/**
 * Get Appeals Handler
 *
 * Admin endpoint to list ban appeals.
 * Auto-resolves pending appeals when ban has expired.
 *
 * GET /admin/appeals?status=pending&limit=20
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Auto-resolve appeal when ban has expired
 * Changes status to 'auto_resolved' with reason "Ban đã hết hạn"
 */
async function autoResolveExpiredAppeal(appeal: any): Promise<void> {
  const now = Date.now();
  const appealId = appeal.appealId;

  try {
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
              reviewedBy = :system,
              reviewedByUsername = :systemName,
              reviewNotes = :notes,
              GSI1PK = :newGsi1pk,
              GSI1SK = :newGsi1sk
        `,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'auto_resolved',
          ':now': now,
          ':system': 'SYSTEM',
          ':systemName': 'Hệ thống',
          ':notes': 'Ban đã hết hạn - Kháng cáo tự động đóng',
          ':newGsi1pk': 'APPEAL#auto_resolved',
          ':newGsi1sk': `${now}#${appealId}`,
        },
      })
    );
    console.log('Auto-resolved expired appeal', { appealId, userId: appeal.userId });
  } catch (error) {
    console.error('Failed to auto-resolve appeal', { appealId, error });
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // Authorization check
    requireAdminRole(event);

    // Parse query params
    const status = event.queryStringParameters?.status || 'pending';
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 100);
    const lastKey = event.queryStringParameters?.lastKey;

    // Query appeals by status using GSI
    const queryParams: any = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `APPEAL#${status}`,
      },
      Limit: limit,
      ScanIndexForward: false, // Most recent first
    };

    if (lastKey) {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString());
    }

    const result = await dynamoDB.send(new QueryCommand(queryParams));
    const now = Date.now();

    // Filter out and auto-resolve expired appeals (only for pending status)
    const validAppeals: any[] = [];
    const expiredAppeals: any[] = [];

    for (const item of result.Items || []) {
      // Check if ban has expired (only for pending appeals with temporary ban)
      if (status === 'pending' && item.banExpiresAt && now >= item.banExpiresAt) {
        expiredAppeals.push(item);
      } else {
        validAppeals.push(item);
      }
    }

    // Auto-resolve expired appeals in background
    if (expiredAppeals.length > 0) {
      console.log(`Auto-resolving ${expiredAppeals.length} expired appeals`);
      // Don't await - let it run in background
      Promise.all(expiredAppeals.map((appeal) => autoResolveExpiredAppeal(appeal))).catch((err) =>
        console.error('Failed to auto-resolve some appeals', err)
      );
    }

    // Get appeal history for each user
    const appealsWithHistory = await Promise.all(
      validAppeals.map(async (item) => {
        // Get previous appeals for this user (excluding current one)
        let previousAppeals: any[] = [];
        try {
          const historyResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              FilterExpression: 'appealId <> :currentId',
              ExpressionAttributeValues: {
                ':pk': `USER#${item.userId}`,
                ':sk': 'APPEAL#',
                ':currentId': item.appealId,
              },
              ScanIndexForward: false,
            })
          );
          previousAppeals = (historyResult.Items || []).map((h) => ({
            appealId: h.appealId,
            reason: h.reason,
            status: h.status,
            createdAt: h.createdAt,
            reviewedAt: h.reviewedAt,
            reviewedByUsername: h.reviewedByUsername,
            reviewNotes: h.reviewNotes,
          }));
        } catch (e) {
          console.warn('Failed to get appeal history:', e);
        }

        return {
          appealId: item.appealId,
          userId: item.userId,
          username: item.username,
          reason: item.reason,
          contactEmail: item.contactEmail,
          status: item.status,
          banReason: item.banReason,
          banExpiresAt: item.banExpiresAt,
          banDurationDisplay: item.banDurationDisplay,
          createdAt: item.createdAt,
          reviewedAt: item.reviewedAt,
          reviewedBy: item.reviewedBy,
          reviewedByUsername: item.reviewedByUsername,
          reviewNotes: item.reviewNotes,
          // Violation details
          violationType: item.violationType,
          postId: item.postId,
          commentId: item.commentId,
          violationContent: item.violationContent,
          reportCount: item.reportCount,
          // Appeal history
          previousAppeals,
          appealCount: previousAppeals.length + 1,
        };
      })
    );

    const response: any = {
      appeals: appealsWithHistory,
      count: appealsWithHistory.length,
      autoResolved: expiredAppeals.length,
      hasMore: !!result.LastEvaluatedKey,
    };

    if (result.LastEvaluatedKey) {
      response.lastKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return createSuccessResponse(200, response, correlationId);
  } catch (error) {
    return handleError(error, correlationId);
  }
}
