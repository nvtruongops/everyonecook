/**
 * Ban Status Handler
 *
 * Returns the current ban status of the authenticated user.
 * Used for polling to detect if user has been banned while logged in.
 *
 * GET /users/ban-status
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.TABLE_NAME || 'EveryoneCook-dev-v2';

interface BanStatusResponse {
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  banExpiresAt?: number;
  violationType?: string;
  violationContent?: string;
  reportCount?: number;
  postId?: string;
  commentId?: string;
}

/**
 * Get ban status for authenticated user
 */
export async function getBanStatus(userId: string): Promise<BanStatusResponse> {
  // Get user profile
  const profileResult = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
      ProjectionExpression: 'isBanned, banReason, bannedAt, banExpiresAt',
    })
  );

  const profile = profileResult.Item;
  if (!profile) {
    return { isBanned: false };
  }

  if (!profile.isBanned) {
    return { isBanned: false };
  }

  // User is banned - get additional info from violation record
  let violationInfo: Partial<BanStatusResponse> = {};

  try {
    // Query latest violation for this user
    const violationResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'VIOLATION#',
        },
        ScanIndexForward: false, // Latest first
        Limit: 1,
      })
    );

    const violation = violationResult.Items?.[0];
    if (violation) {
      violationInfo = {
        violationType: violation.violationType,
        postId: violation.postId,
        commentId: violation.commentId,
      };

      // Get violation content if it's a post/comment
      if (violation.postId) {
        const postResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${violation.postId}`,
              SK: 'METADATA',
            },
            ProjectionExpression: 'content, title',
          })
        );
        if (postResult.Item) {
          violationInfo.violationContent =
            postResult.Item.content?.substring(0, 200) || postResult.Item.title?.substring(0, 200);
        }
      } else if (violation.commentId) {
        const commentResult = await dynamoDB.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `COMMENT#${violation.commentId}`,
              SK: 'METADATA',
            },
            ProjectionExpression: 'content',
          })
        );
        if (commentResult.Item) {
          violationInfo.violationContent = commentResult.Item.content?.substring(0, 200);
        }
      }

      // Get report count for this violation
      if (violation.postId || violation.commentId) {
        const targetId = violation.postId || violation.commentId;
        const reportResult = await dynamoDB.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': violation.postId ? `POST#${targetId}` : `COMMENT#${targetId}`,
              ':sk': 'REPORT#',
            },
            Select: 'COUNT',
          })
        );
        violationInfo.reportCount = reportResult.Count || 0;
      }
    }
  } catch (error) {
    console.error('[getBanStatus] Error fetching violation info:', error);
  }

  return {
    isBanned: true,
    banReason: profile.banReason,
    bannedAt: profile.bannedAt,
    banExpiresAt: profile.banExpiresAt,
    ...violationInfo,
  };
}
