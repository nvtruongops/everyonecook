/**
 * Friendship Service (Auth Module)
 *
 * Lightweight service to check friendship status for search results.
 * Full friendship management is in social-module.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

export type FriendshipStatusType =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'blocked'
  | 'blocked_by';

/**
 * Get friendship status between two users
 *
 * @param viewerId - Current user's userId
 * @param targetUserId - Target user's userId
 * @returns Friendship status
 */
export async function getFriendshipStatus(
  viewerId: string | null,
  targetUserId: string
): Promise<FriendshipStatusType> {
  // Anonymous users have no friendship
  if (!viewerId) {
    return 'none';
  }

  // Same user
  if (viewerId === targetUserId) {
    return 'none';
  }

  try {
    // Check friendship from viewer to target
    const viewerToTarget = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${viewerId}`,
          SK: `FRIEND#${targetUserId}`,
        },
      })
    );

    if (viewerToTarget.Item) {
      const status = viewerToTarget.Item.status;
      if (status === 'accepted') return 'friends';
      if (status === 'pending') return 'pending_sent';
      if (status === 'blocked') return 'blocked';
    }

    // Check reverse friendship (target to viewer)
    const targetToViewer = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${targetUserId}`,
          SK: `FRIEND#${viewerId}`,
        },
      })
    );

    if (targetToViewer.Item) {
      const status = targetToViewer.Item.status;
      if (status === 'accepted') return 'friends';
      if (status === 'pending') return 'pending_received';
      if (status === 'blocked') return 'blocked_by';
    }

    return 'none';
  } catch (error) {
    console.error('Error getting friendship status:', error);
    return 'none';
  }
}
