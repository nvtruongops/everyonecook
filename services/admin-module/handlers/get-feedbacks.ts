/**
 * Get Feedbacks Handler
 *
 * GET /admin/feedbacks - Get all feedbacks (admin)
 * GET /feedback/my - Get user's own feedbacks
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { isAdminUser } from '../middleware/admin-auth';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const path = event.path;
    const isAdminRequest = path.includes('/admin/');
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status || 'all';
    const limit = parseInt(queryParams.limit || '20', 10);

    let feedbacks: any[] = [];

    if (isAdminRequest) {
      // Admin: check admin permission
      const adminCheck = await isAdminUser(event);
      if (!adminCheck) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Admin access required' }),
        };
      }

      // Query by status using GSI - chỉ có pending và closed
      if (status !== 'all') {
        const result = await dynamoDB.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :gsi1pk',
            ExpressionAttributeValues: { ':gsi1pk': `FEEDBACK#${status}` },
            ScanIndexForward: false,
            Limit: limit,
          })
        );
        feedbacks = result.Items || [];
      } else {
        // Get all feedbacks - chỉ query pending và closed
        const statuses = ['pending', 'closed'];
        for (const s of statuses) {
          const result = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              IndexName: 'GSI1',
              KeyConditionExpression: 'GSI1PK = :gsi1pk',
              ExpressionAttributeValues: { ':gsi1pk': `FEEDBACK#${s}` },
              ScanIndexForward: false,
              Limit: limit,
            })
          );
          feedbacks.push(...(result.Items || []));
        }
        // Sort by createdAt desc
        feedbacks.sort((a, b) => b.createdAt - a.createdAt);
        feedbacks = feedbacks.slice(0, limit);
      }
    } else {
      // User: get own feedbacks
      const result = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'FEEDBACK#',
          },
          ScanIndexForward: false,
          Limit: limit,
        })
      );
      feedbacks = result.Items || [];
    }

    return createSuccessResponse(
      200,
      {
        feedbacks: feedbacks.map((f) => ({
          feedbackId: f.feedbackId,
          userId: f.userId,
          username: f.username,
          userAvatarUrl: f.userAvatarUrl,
          title: f.title,
          content: f.content,
          status: f.status,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        })),
        count: feedbacks.length,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
