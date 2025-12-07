/**
 * Submit Appeal Handler
 *
 * Endpoint for banned users to submit an appeal.
 * Creates an appeal record for admin review.
 *
 * POST /admin/appeals
 * Body: { userId, reason, contactEmail? }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

// Validation schema
const SubmitAppealSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  reason: z
    .string()
    .min(10, 'Nội dung kháng cáo phải có ít nhất 10 ký tự')
    .max(1000, 'Nội dung kháng cáo không được quá 1000 ký tự')
    .trim(),
  // Optional: for content appeal (post/comment hidden)
  appealType: z.enum(['ban', 'content']).optional().default('ban'),
  contentType: z.enum(['post', 'comment']).optional(),
  contentId: z.string().optional(), // postId or commentId
  violationId: z.string().optional(),
});

export type AppealStatus = 'pending' | 'approved' | 'rejected';
export type AppealType = 'ban' | 'content';

export interface Appeal {
  PK: string;
  SK: string;
  appealId: string;
  userId: string;
  username?: string;
  reason: string;
  contactEmail?: string;
  status: AppealStatus;
  // Appeal type: 'ban' for account ban, 'content' for hidden post/comment
  appealType: AppealType;
  // For ban appeals
  banReason?: string;
  banExpiresAt?: number | null;
  banDurationDisplay?: string;
  // For content appeals (post/comment hidden)
  contentType?: 'post' | 'comment';
  contentId?: string;
  hiddenReason?: string;
  // Violation details
  violationType?: string;
  violationId?: string;
  postId?: string;
  commentId?: string;
  violationContent?: string;
  reportCount?: number;
  // Timestamps
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewNotes?: string;
  GSI1PK: string;
  GSI1SK: string;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // Parse and validate body
    const body = JSON.parse(event.body || '{}');
    const validationResult = SubmitAppealSchema.safeParse(body);

    if (!validationResult.success) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Validation failed',
          details: validationResult.error.errors,
        }),
      };
    }

    const { userId, reason, appealType, contentType, contentId, violationId } = validationResult.data;

    // 1. Check if user exists
    const userResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      })
    );

    const profile = userResult.Item;

    if (!profile) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // 2. Validate based on appeal type
    let hiddenContent: any = null;
    let hiddenReason = '';

    if (appealType === 'ban') {
      // Ban appeal: user must be banned
      if (!profile.isBanned) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'User is not banned' }),
        };
      }
    } else if (appealType === 'content') {
      // Content appeal: must provide contentType and contentId
      if (!contentType || !contentId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'contentType and contentId are required for content appeal' }),
        };
      }

      // Check if content exists and is hidden
      if (contentType === 'post') {
        const postResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${contentId}`,
              SK: 'METADATA',
            },
          })
        );
        hiddenContent = postResult.Item;
        if (!hiddenContent || hiddenContent.status !== 'hidden') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Post not found or not hidden' }),
          };
        }
        if (hiddenContent.canAppeal === false) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'This post cannot be appealed' }),
          };
        }
        hiddenReason = hiddenContent.hiddenReason || '';
      } else if (contentType === 'comment') {
        // Need to find comment - scan for it (without Limit since it applies before filter)
        const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
        let scanResult = await dynamoDB.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'SK = :sk',
            ExpressionAttributeValues: {
              ':sk': `COMMENT#${contentId}`,
            },
          })
        );
        hiddenContent = scanResult.Items?.[0];
        
        // Continue scanning if not found (pagination)
        while (!hiddenContent && scanResult.LastEvaluatedKey) {
          scanResult = await dynamoDB.send(
            new ScanCommand({
              TableName: TABLE_NAME,
              FilterExpression: 'SK = :sk',
              ExpressionAttributeValues: {
                ':sk': `COMMENT#${contentId}`,
              },
              ExclusiveStartKey: scanResult.LastEvaluatedKey,
            })
          );
          hiddenContent = scanResult.Items?.[0];
        }
        
        if (!hiddenContent || hiddenContent.status !== 'hidden') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Comment not found or not hidden' }),
          };
        }
        if (hiddenContent.canAppeal === false) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'This comment cannot be appealed' }),
          };
        }
        hiddenReason = hiddenContent.hiddenReason || '';
      }
    }

    // 3. Check for existing pending appeal for this specific content/ban
    const existingAppeals = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :pending AND appealType = :appealType' + 
          (contentId ? ' AND contentId = :contentId' : ''),
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'APPEAL#',
          ':pending': 'pending',
          ':appealType': appealType,
          ...(contentId ? { ':contentId': contentId } : {}),
        },
      })
    );

    if (existingAppeals.Items && existingAppeals.Items.length > 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'You already have a pending appeal for this',
          existingAppealId: existingAppeals.Items[0].appealId,
        }),
      };
    }

    // 3. Get violation details (postId, commentId, content, reportCount)
    let violationType: string | undefined;
    let postId: string | undefined;
    let commentId: string | undefined;
    let violationContent: string | undefined;
    let reportCount = 0;

    try {
      const violationResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'VIOLATION#',
          },
          ScanIndexForward: false,
          Limit: 1,
        })
      );

      const violation = violationResult.Items?.[0];
      if (violation) {
        violationType = violation.violationType;
        postId = violation.postId;
        commentId = violation.commentId;

        // Get content and report count
        if (violation.postId) {
          // Get post content
          const postResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `POST#${violation.postId}`,
                ':sk': 'META',
              },
              Limit: 1,
            })
          );
          const post = postResult.Items?.[0];
          if (post) {
            const content = post.caption || post.title || '';
            violationContent = content.length > 300 ? content.substring(0, 300) + '...' : content;
          }

          // Get report count
          const reportResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `POST#${violation.postId}`,
                ':sk': 'REPORT#',
              },
              Select: 'COUNT',
            })
          );
          reportCount = reportResult.Count || 0;
        } else if (violation.commentId) {
          // Get comment content
          const commentResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `COMMENT#${violation.commentId}`,
                ':sk': 'META',
              },
              Limit: 1,
            })
          );
          const comment = commentResult.Items?.[0];
          if (comment) {
            const content = comment.content || '';
            violationContent = content.length > 300 ? content.substring(0, 300) + '...' : content;
          }

          // Get report count
          const reportResult = await dynamoDB.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: {
                ':pk': `COMMENT#${violation.commentId}`,
                ':sk': 'REPORT#',
              },
              Select: 'COUNT',
            })
          );
          reportCount = reportResult.Count || 0;
        }
      }
    } catch (violationError) {
      console.warn('Failed to get violation details:', violationError);
    }

    // 4. Create appeal record
    const appealId = uuidv4();
    const now = Date.now();

    // Calculate TTL based on appeal type
    let appealTtl: number;
    if (appealType === 'ban') {
      if (profile.banExpiresAt) {
        // Temporary ban: TTL = ban expiry + 7 days buffer for admin review
        appealTtl = Math.floor(profile.banExpiresAt / 1000) + 7 * 24 * 60 * 60;
      } else {
        // Permanent ban: TTL = 90 days from now
        appealTtl = Math.floor(now / 1000) + 90 * 24 * 60 * 60;
      }
    } else {
      // Content appeal: TTL = appealDeadline + 7 days or 30 days from now
      const deadline = hiddenContent?.appealDeadline;
      if (deadline) {
        appealTtl = Math.floor(deadline / 1000) + 7 * 24 * 60 * 60;
      } else {
        appealTtl = Math.floor(now / 1000) + 30 * 24 * 60 * 60;
      }
    }

    const appeal: Appeal & { ttl?: number } = {
      PK: `USER#${userId}`,
      SK: `APPEAL#${appealId}`,
      appealId,
      userId,
      username: profile.username,
      reason,
      contactEmail: profile.email,
      status: 'pending',
      appealType: appealType || 'ban',
      // Ban appeal fields
      banReason: appealType === 'ban' ? profile.banReason : undefined,
      banExpiresAt: appealType === 'ban' ? profile.banExpiresAt : undefined,
      banDurationDisplay: appealType === 'ban' ? profile.banDurationDisplay : undefined,
      // Content appeal fields
      contentType: appealType === 'content' ? contentType : undefined,
      contentId: appealType === 'content' ? contentId : undefined,
      hiddenReason: appealType === 'content' ? hiddenReason : undefined,
      // Violation details
      violationType,
      violationId,
      postId: appealType === 'content' && contentType === 'post' ? contentId : postId,
      commentId: appealType === 'content' && contentType === 'comment' ? contentId : commentId,
      violationContent,
      reportCount,
      createdAt: now,
      GSI1PK: 'APPEAL#pending',
      GSI1SK: `${now}#${appealId}`,
      ttl: appealTtl,
    };

    await dynamoDB.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: appeal,
      })
    );

    console.log('Appeal submitted', { appealId, appealType, userId, contentType, contentId });

    return createSuccessResponse(
      201,
      {
        message: 'Appeal submitted successfully',
        appealId,
        status: 'pending',
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
