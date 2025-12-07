/**
 * Close Feedback Handler
 *
 * POST /admin/feedbacks/:feedbackId/close
 * Admin only - closes a feedback thread
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

    // Check admin permission
    const isAdmin = await isAdminUser(event);
    if (!isAdmin) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Admin access required' }),
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

    // Find feedback - chỉ tìm trong pending (chưa đóng)
    let feedback: any = null;
    const result = await dynamoDB.send(
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
    if (result.Items?.[0]) {
      feedback = result.Items[0];
    }

    if (!feedback) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Feedback not found' }),
      };
    }

    if (feedback.status === 'closed') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Feedback already closed' }),
      };
    }

    // Close feedback
    const now = Date.now();
    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: feedback.PK, SK: feedback.SK },
        UpdateExpression:
          'SET #status = :status, GSI1PK = :gsi1pk, updatedAt = :now, closedAt = :now, closedBy = :closedBy',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'closed',
          ':gsi1pk': 'FEEDBACK#closed',
          ':now': now,
          ':closedBy': userId,
        },
      })
    );

    console.log('Feedback closed', { feedbackId, closedBy: userId });

    return createSuccessResponse(
      200,
      {
        message: 'Góp ý đã được đóng',
        feedbackId,
        status: 'closed',
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
