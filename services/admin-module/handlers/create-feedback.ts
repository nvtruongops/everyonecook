/**
 * Create Feedback Handler
 *
 * POST /feedback
 * Body: { title, content }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Feedback } from '../models/feedback';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const CreateFeedbackSchema = z.object({
  title: z
    .string()
    .min(5, 'Tiêu đề phải có ít nhất 5 ký tự')
    .max(200, 'Tiêu đề không quá 200 ký tự')
    .trim(),
  content: z
    .string()
    .min(10, 'Nội dung phải có ít nhất 10 ký tự')
    .max(2000, 'Nội dung không quá 2000 ký tự')
    .trim(),
});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // Get user from authorizer
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Parse and validate body
    const body = JSON.parse(event.body || '{}');
    const validationResult = CreateFeedbackSchema.safeParse(body);

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

    const { title, content } = validationResult.data;

    // Get user profile
    const userResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );

    const profile = userResult.Item;
    if (!profile) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // Create feedback
    const feedbackId = uuidv4();
    const now = Date.now();

    const feedback: Feedback = {
      PK: `USER#${userId}`,
      SK: `FEEDBACK#${feedbackId}`,
      feedbackId,
      userId,
      username: profile.username,
      userAvatarUrl: profile.avatarUrl,
      title,
      content,
      status: 'pending',
      createdAt: now,
      GSI1PK: 'FEEDBACK#pending',
      GSI1SK: `${now}#${feedbackId}`,
    };

    await dynamoDB.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: feedback,
      })
    );

    console.log('Feedback created', { feedbackId, userId });

    return createSuccessResponse(
      201,
      {
        message: 'Góp ý đã được gửi thành công',
        feedbackId,
        status: 'pending',
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
