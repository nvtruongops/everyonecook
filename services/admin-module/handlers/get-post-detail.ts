/**
 * Get Post Detail Handler
 *
 * Admin endpoint to get full post details with all reports.
 * GET /admin/posts/:postId
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // Get postId from path
    const postId = event.pathParameters?.postId;
    if (!postId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Post ID is required' }),
      };
    }

    console.log('[GetPostDetail] Request', { correlationId, adminUserId, postId });

    // 1. Get post metadata
    const postResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `POST#${postId}`, SK: 'METADATA' },
      })
    );

    if (!postResult.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Post not found' }),
      };
    }

    const post = postResult.Item;

    // 2. Get author profile
    let authorProfile = null;
    if (post.authorId) {
      const authorResult = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${post.authorId}`, SK: 'PROFILE' },
        })
      );
      authorProfile = authorResult.Item;
    }

    // 3. Get all reports for this post
    const reportsResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `POST#${postId}`,
          ':sk': 'REPORT#',
        },
      })
    );

    // Get reporter usernames for reports that don't have them
    const reports = await Promise.all(
      (reportsResult.Items || []).map(async (item: any) => {
        let reporterUsername = item.reporterUsername;

        // If no username stored, fetch from user profile
        if (!reporterUsername && item.reporterId) {
          const userResult = await dynamoDB.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: { PK: `USER#${item.reporterId}`, SK: 'PROFILE' },
              ProjectionExpression: 'username',
            })
          );
          reporterUsername = userResult.Item?.username || 'Unknown';
        }

        return {
          reportId: item.reportId,
          reporterId: item.reporterId,
          reporterUsername: reporterUsername || 'Unknown',
          reason: item.reason,
          details: item.details,
          createdAt: item.createdAt,
        };
      })
    );

    // 4. Get author's violation history
    let violations: any[] = [];
    if (post.authorId) {
      const violationsResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${post.authorId}`,
            ':sk': 'VIOLATION#',
          },
          Limit: 10,
          ScanIndexForward: false,
        })
      );
      violations = (violationsResult.Items || []).map((item: any) => ({
        violationId: item.violationId,
        type: item.type,
        reason: item.reason,
        severity: item.severity,
        createdAt: item.createdAt,
        postId: item.postId,
      }));
    }

    // 5. Build response
    const response = {
      post: {
        postId: post.postId,
        authorId: post.authorId,
        authorUsername: post.authorUsername || authorProfile?.username || 'Unknown',
        authorAvatarUrl: authorProfile?.avatarUrl,
        title: post.title,
        caption: post.caption,
        imageUrls: post.imageUrls || [],
        recipeId: post.recipeId,
        status: post.status || 'active',
        reportCount: post.reportCount || 0,
        likeCount: post.likeCount || 0,
        commentCount: post.commentCount || 0,
        createdAt: post.createdAt,
        hiddenAt: post.hiddenAt,
        hiddenReason: post.hiddenReason,
        deletedAt: post.deletedAt,
        // Moderation info
        moderationAction: post.moderationAction,
        moderationReason: post.moderationReason,
        moderatedAt: post.moderatedAt,
        moderatedBy: post.moderatedBy,
        reviewedAt: post.reviewedAt,
      },
      author: authorProfile
        ? {
            userId: authorProfile.userId,
            username: authorProfile.username,
            displayName: authorProfile.displayName,
            email: authorProfile.email,
            avatarUrl: authorProfile.avatarUrl,
            isBanned: authorProfile.isBanned || false,
            banReason: authorProfile.banReason,
            // Use violationCount from profile (updated by take-action), fallback to counting violations
            violationCount: authorProfile.violationCount ?? violations.length,
          }
        : null,
      reports,
      reportSummary: {
        total: reports.length,
        byReason: reports.reduce((acc: any, r: any) => {
          acc[r.reason] = (acc[r.reason] || 0) + 1;
          return acc;
        }, {}),
      },
      authorViolations: violations,
    };

    return createSuccessResponse(200, response, correlationId);
  } catch (error) {
    console.error('[GetPostDetail] Error:', error);
    return handleError(error, correlationId);
  }
}
