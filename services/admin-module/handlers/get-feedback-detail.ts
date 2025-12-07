/**
 * Get Feedback Detail Handler
 *
 * GET /feedback/:feedbackId
 * GET /admin/feedbacks/:feedbackId
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

    const feedbackId = event.pathParameters?.feedbackId;
    if (!feedbackId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Feedback ID required' }),
      };
    }

    const isAdmin = isAdminUser(event);

    // Get feedback - query by feedbackId using GSI or scan
    // First, try to find the feedback
    const feedbackResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        FilterExpression: 'feedbackId = :feedbackId',
        ExpressionAttributeValues: {
          ':gsi1pk': 'FEEDBACK#pending',
          ':feedbackId': feedbackId,
        },
      })
    );

    let feedback = feedbackResult.Items?.[0];

    // If not found in pending, check closed status
    if (!feedback) {
      const result = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          FilterExpression: 'feedbackId = :feedbackId',
          ExpressionAttributeValues: {
            ':gsi1pk': 'FEEDBACK#closed',
            ':feedbackId': feedbackId,
          },
        })
      );
      if (result.Items?.[0]) {
        feedback = result.Items[0];
      }
    }

    if (!feedback) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Feedback not found' }),
      };
    }

    // Check permission
    if (!isAdmin && feedback.userId !== userId) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Access denied' }),
      };
    }

    // Get replies
    const repliesResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `FEEDBACK#${feedbackId}`,
          ':sk': 'REPLY#',
        },
        ScanIndexForward: true,
      })
    );

    const replies = (repliesResult.Items || []).map((r) => ({
      replyId: r.replyId,
      feedbackId: r.feedbackId,
      userId: r.userId,
      username: r.username,
      userAvatarUrl: r.userAvatarUrl,
      content: r.content,
      isAdmin: r.isAdmin,
      createdAt: r.createdAt,
    }));

    // Không tự động thay đổi status khi xem - chỉ thay đổi khi close

    return createSuccessResponse(
      200,
      {
        feedback: {
          feedbackId: feedback.feedbackId,
          userId: feedback.userId,
          username: feedback.username,
          userAvatarUrl: feedback.userAvatarUrl,
          title: feedback.title,
          content: feedback.content,
          status: feedback.status,
          createdAt: feedback.createdAt,
          updatedAt: feedback.updatedAt,
        },
        replies,
        replyCount: replies.length,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
