/**
 * Reply Feedback Handler
 *
 * POST /feedback/:feedbackId/reply
 * POST /admin/feedbacks/:feedbackId/reply
 * Body: { content }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { isAdminUser } from '../middleware/admin-auth';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { FeedbackReply } from '../models/feedback';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const ReplySchema = z.object({
  content: z
    .string()
    .min(1, 'Nội dung không được để trống')
    .max(1000, 'Nội dung không quá 1000 ký tự')
    .trim(),
});

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

    // Parse and validate body
    const body = JSON.parse(event.body || '{}');
    const validationResult = ReplySchema.safeParse(body);

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

    const { content } = validationResult.data;
    const isAdmin = await isAdminUser(event);

    // Find feedback - only pending and closed statuses
    let feedback: any = null;
    for (const status of ['pending', 'closed']) {
      const result = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          FilterExpression: 'feedbackId = :feedbackId',
          ExpressionAttributeValues: {
            ':gsi1pk': `FEEDBACK#${status}`,
            ':feedbackId': feedbackId,
          },
        })
      );
      if (result.Items?.[0]) {
        feedback = result.Items[0];
        break;
      }
    }

    if (!feedback) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Feedback not found' }),
      };
    }

    // Check permission - only feedback owner or admin can reply
    if (!isAdmin && feedback.userId !== userId) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Access denied' }),
      };
    }

    // Get user profile
    const userResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    const profile = userResult.Item;

    // Create reply
    const replyId = uuidv4();
    const now = Date.now();

    const reply: FeedbackReply = {
      PK: `FEEDBACK#${feedbackId}`,
      SK: `REPLY#${now}#${replyId}`,
      replyId,
      feedbackId,
      userId,
      username: profile?.username || 'Unknown',
      userAvatarUrl: profile?.avatarUrl,
      content,
      isAdmin,
      createdAt: now,
    };

    await dynamoDB.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: reply,
      })
    );

    // Chỉ update updatedAt, không thay đổi status (status chỉ thay đổi khi close)
    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: feedback.PK, SK: feedback.SK },
        UpdateExpression: 'SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':now': now,
        },
      })
    );

    console.log('Reply created', { replyId, feedbackId, isAdmin });

    return createSuccessResponse(
      201,
      {
        message: 'Phản hồi đã được gửi',
        reply: {
          replyId,
          feedbackId,
          userId,
          username: profile?.username,
          userAvatarUrl: profile?.avatarUrl,
          content,
          isAdmin,
          createdAt: now,
        },
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
