/**
 * Violations Handler
 *
 * Endpoint for users to view their violation details
 * GET /users/me/violations?type=post|comment&id={contentId}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

function successResponse(data: any): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ data }),
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Get user ID from JWT token claims
 */
function getUserIdFromEvent(event: APIGatewayProxyEvent): string | null {
  const claims = event.requestContext?.authorizer?.claims;
  return claims?.sub || claims?.['cognito:username'] || null;
}

/**
 * Get violation detail for a user's hidden content
 * User can only view their own violations
 */
export async function getMyViolationDetail(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse(401, 'Unauthorized');
    }

    const contentType = event.queryStringParameters?.type as 'post' | 'comment';
    const contentId = event.queryStringParameters?.id;
    const violationId = event.queryStringParameters?.violationId;

    if (!contentType || !contentId) {
      return errorResponse(400, 'Missing type or id parameter');
    }

    if (!['post', 'comment'].includes(contentType)) {
      return errorResponse(400, 'Invalid content type');
    }

    // Get content details
    let content: any = null;
    if (contentType === 'post') {
      const postResult = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `POST#${contentId}`, SK: 'METADATA' },
        })
      );
      content = postResult.Item;

      // Verify user owns this content
      if (content && content.authorId !== userId) {
        return errorResponse(403, 'You can only view your own violations');
      }
    } else if (contentType === 'comment') {
      // Find comment by scanning (comments are stored under POST#)
      // Note: Scan with Limit applies BEFORE FilterExpression, so we need to scan more items
      let scanResult = await dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'SK = :sk',
          ExpressionAttributeValues: {
            ':sk': `COMMENT#${contentId}`,
          },
        })
      );
      content = scanResult.Items?.[0];

      // If not found in first scan, continue scanning (pagination)
      while (!content && scanResult.LastEvaluatedKey) {
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
        content = scanResult.Items?.[0];
      }

      // Verify user owns this content
      if (content && content.authorId !== userId) {
        return errorResponse(403, 'You can only view your own violations');
      }
    }

    // If content not found, try to get info from notification or violation record
    // This handles cases where content was deleted but user still has notification
    if (!content) {
      // Try to find violation record directly
      const violationsResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'VIOLATION#',
          },
          ScanIndexForward: false,
        })
      );

      const violation = violationsResult.Items?.find((v) => {
        if (contentType === 'post') return v.postId === contentId;
        if (contentType === 'comment') return v.commentId === contentId;
        return false;
      });

      if (violation) {
        // Get author profile
        const authorResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
          })
        );
        const authorProfile = authorResult.Item;

        // Return violation info even without content
        return successResponse({
          violationId: violation.violationId,
          contentType,
          contentId,
          content: {
            id: contentId,
            authorId: userId,
            authorUsername: authorProfile?.username || 'Unknown',
            authorAvatarUrl: authorProfile?.avatarUrl,
            caption: violation.violationContent || 'Nội dung đã bị xóa',
            status: 'deleted',
            hiddenReason: violation.reason,
            canAppeal: false,
          },
          violation: {
            type: violation.type || 'hide',
            reason: violation.reason || 'Vi phạm quy định cộng đồng',
            severity: violation.severity || 'medium',
            adminUsername: violation.adminUsername,
            createdAt: violation.createdAt || Date.now(),
            reportCount: violation.reportCount || 0,
          },
          appeal: undefined,
          contentDeleted: true,
        });
      }

      return errorResponse(404, 'Content not found');
    }

    // Get author profile
    const authorResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    const authorProfile = authorResult.Item;

    // Get violation record
    let violation: any = null;
    if (violationId) {
      const violationResult = await dynamoDB.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: `VIOLATION#${violationId}` },
        })
      );
      violation = violationResult.Item;
    } else {
      // Find latest violation for this content
      const violationsResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'VIOLATION#',
          },
          ScanIndexForward: false,
        })
      );

      // Find violation matching this content
      violation = violationsResult.Items?.find((v) => {
        if (contentType === 'post') return v.postId === contentId;
        if (contentType === 'comment') return v.commentId === contentId;
        return false;
      });
    }

    // Get appeal status for this content
    let appeal: any = null;
    const appealsResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'contentType = :contentType AND contentId = :contentId',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'APPEAL#',
          ':contentType': contentType,
          ':contentId': contentId,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );
    appeal = appealsResult.Items?.[0];

    // Build response
    const response = {
      violationId: violation?.violationId,
      contentType,
      contentId,
      content: {
        id: contentId,
        authorId: content.authorId,
        authorUsername: authorProfile?.username || 'Unknown',
        authorAvatarUrl: authorProfile?.avatarUrl,
        text: contentType === 'comment' ? content.content : undefined,
        caption: contentType === 'post' ? content.caption || content.title : undefined,
        imageUrls: contentType === 'post' ? content.imageUrls : undefined,
        status: content.status,
        hiddenAt: content.hiddenAt,
        hiddenReason: content.hiddenReason,
        canAppeal: content.canAppeal !== false,
        appealDeadline: content.appealDeadline,
      },
      violation: {
        type: violation?.type || content.moderationAction || 'hide',
        reason: violation?.reason || content.hiddenReason || 'Vi phạm quy định cộng đồng',
        severity: violation?.severity || 'medium',
        adminUsername: violation?.adminUsername,
        createdAt: violation?.createdAt || content.hiddenAt || Date.now(),
        reportCount: violation?.reportCount || content.reportCount || 0,
      },
      appeal: appeal
        ? {
            appealId: appeal.appealId,
            status: appeal.status,
            reason: appeal.reason,
            createdAt: appeal.createdAt,
            reviewedAt: appeal.reviewedAt,
            reviewNotes: appeal.reviewNotes,
          }
        : undefined,
    };

    return successResponse(response);
  } catch (error: any) {
    console.error('[ViolationsHandler] Error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
}
