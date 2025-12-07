/**
 * Get Comment Detail Handler
 *
 * API handler for retrieving comment details with all reports for admin review.
 * GET /admin/comments/{commentId}
 *
 * Comment structure in DynamoDB:
 * - PK: POST#{postId}
 * - SK: COMMENT#{commentId}
 *
 * Report structure:
 * - PK: COMMENT#{commentId}
 * - SK: REPORT#{reportId}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Get Comment Detail Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    // 1. Require admin role
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // 2. Get commentId from path
    const commentId = event.pathParameters?.commentId;
    if (!commentId) {
      return createSuccessResponse(400, { error: 'Comment ID is required' }, correlationId);
    }

    console.log('[GetCommentDetail] Request', {
      correlationId,
      adminUserId,
      commentId,
    });

    // 3. First, try to get postId from the report (if exists)
    // Reports are stored as PK=COMMENT#{commentId}, SK=REPORT#{reportId}
    let comment: any = null;
    let postId: string | null = null;

    // First check if there's a report that has postId
    const reportQuery = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :reportPrefix)',
        ExpressionAttributeValues: {
          ':pk': `COMMENT#${commentId}`,
          ':reportPrefix': 'REPORT#',
        },
        Limit: 1,
      })
    );

    if (reportQuery.Items && reportQuery.Items.length > 0 && reportQuery.Items[0].postId) {
      postId = reportQuery.Items[0].postId;
      console.log('[GetCommentDetail] Found postId from report', { postId });
    }

    // If we have postId, query directly
    if (postId) {
      const commentResult = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: `COMMENT#${commentId}`,
          },
        })
      );
      comment = commentResult.Item;
    }

    // If still not found, scan with pagination
    if (!comment) {
      console.log('[GetCommentDetail] Scanning for comment', {
        tableName: TABLE_NAME,
        commentId,
      });

      let lastEvaluatedKey: Record<string, any> | undefined;
      let scanCount = 0;
      const maxScans = 10; // Limit scans to avoid timeout

      do {
        const scanResult = await dynamoDB.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'SK = :sk',
            ExpressionAttributeValues: {
              ':sk': `COMMENT#${commentId}`,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        scanCount++;
        console.log('[GetCommentDetail] Scan iteration', {
          iteration: scanCount,
          itemCount: scanResult.Items?.length || 0,
          scannedCount: scanResult.ScannedCount,
        });

        if (scanResult.Items && scanResult.Items.length > 0) {
          comment = scanResult.Items[0];
          postId = comment.PK?.replace('POST#', '') || null;
          console.log('[GetCommentDetail] Found comment', { postId, authorId: comment.authorId });
          break;
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
      } while (lastEvaluatedKey && scanCount < maxScans);
    }

    if (!comment) {
      console.log('[GetCommentDetail] Comment not found after scan');
      return createSuccessResponse(404, { error: 'Comment not found' }, correlationId);
    }

    // 4. Get all reports for this comment
    // Reports are stored as PK=COMMENT#{commentId}, SK=REPORT#{reportId}
    const reportsResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :reportPrefix)',
        ExpressionAttributeValues: {
          ':pk': `COMMENT#${commentId}`,
          ':reportPrefix': 'REPORT#',
        },
      })
    );

    const reports = (reportsResult.Items || []).map((item: any) => ({
      reportId: item.reportId,
      reporterId: item.reporterId,
      reporterUsername: item.reporterUsername || 'Unknown',
      reason: item.reason,
      details: item.details,
      status: item.status || 'pending',
      createdAt: item.createdAt,
    }));

    // 5. Get author info
    let author = null;
    const authorId = comment.authorId;
    if (authorId) {
      try {
        const authorResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `USER#${authorId}`,
              SK: 'PROFILE',
            },
          })
        );

        if (authorResult.Item) {
          const authorData = authorResult.Item;
          author = {
            userId: authorData.userId || authorId,
            username: authorData.username,
            displayName: authorData.displayName || authorData.fullName,
            email: authorData.email,
            avatarUrl: authorData.avatarUrl,
            isBanned: authorData.isBanned || false,
            banReason: authorData.banReason,
            violationCount: authorData.violationCount || 0,
          };
        }
      } catch (err) {
        console.warn('[GetCommentDetail] Failed to get author:', err);
      }
    }

    // 6. Get author violations
    const authorViolations: any[] = [];
    if (authorId) {
      try {
        const violationsResult = await dynamoDB.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :violationPrefix)',
            ExpressionAttributeValues: {
              ':pk': `USER#${authorId}`,
              ':violationPrefix': 'VIOLATION#',
            },
            Limit: 10,
          })
        );

        for (const item of violationsResult.Items || []) {
          authorViolations.push({
            violationId: item.violationId,
            type: item.type,
            reason: item.reason,
            severity: item.severity || 'medium',
            createdAt: item.createdAt,
            commentId: item.commentId,
          });
        }
      } catch (err) {
        console.warn('[GetCommentDetail] Failed to get violations:', err);
      }
    }

    // 7. Get post info (parent post of the comment)
    let post = null;
    if (postId) {
      try {
        const postResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${postId}`,
              SK: 'METADATA',
            },
          })
        );

        if (postResult.Item) {
          const postData = postResult.Item;
          post = {
            postId: postData.postId || postId,
            authorId: postData.authorId,
            authorUsername: postData.authorUsername || postData.username,
            title: postData.title,
            caption: postData.caption?.substring(0, 200) || postData.content?.substring(0, 200),
          };
        }
      } catch (err) {
        console.warn('[GetCommentDetail] Failed to get post:', err);
      }
    }

    // 8. Calculate report summary
    const reportSummary = {
      total: reports.length,
      byReason: reports.reduce(
        (acc, r) => {
          acc[r.reason] = (acc[r.reason] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      byStatus: reports.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    console.log('[GetCommentDetail] Retrieved', {
      correlationId,
      commentId,
      postId,
      reportCount: reports.length,
    });

    // 9. Return success response
    return createSuccessResponse(
      200,
      {
        comment: {
          commentId: comment.commentId || commentId,
          postId: postId,
          authorId: comment.authorId,
          authorUsername: comment.authorName || author?.username,
          authorAvatarUrl: comment.authorAvatar || author?.avatarUrl,
          content: comment.content,
          status: comment.status || 'active',
          reportCount: reports.length,
          likeCount: comment.likeCount || comment.likes || 0,
          replyCount: comment.replyCount || 0,
          createdAt: comment.createdAt,
          isEdited: comment.isEdited,
          editedAt: comment.editedAt,
          hiddenAt: comment.hiddenAt,
          hiddenReason: comment.hiddenReason,
          // Moderation info
          moderationAction: comment.moderationAction,
          moderationReason: comment.moderationReason,
          moderatedAt: comment.moderatedAt,
          moderatedBy: comment.moderatedBy,
        },
        post,
        author,
        reports,
        reportSummary,
        authorViolations,
      },
      correlationId
    );
  } catch (error) {
    console.error('[GetCommentDetail] Error:', error);
    return handleError(error, correlationId);
  }
}
