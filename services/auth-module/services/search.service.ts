/**
 * Search Service - Business logic for user search operations
 *
 * @module services/search
 * @see .kiro/specs/project-restructure/user-profile-requirements.md - User Search
 * @see .kiro/specs/project-restructure/database-architecture.md - User Profile Entity
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { UserProfile } from '../models/user.model';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Search users by username (partial match)
 *
 * Uses DynamoDB Scan with FilterExpression for username matching
 * Note: This is acceptable for user search as user count is limited
 * and search is not a high-frequency operation
 *
 * @param query - Search query (username partial match)
 * @param limit - Max results per page
 * @param nextToken - Pagination token (base64 encoded LastEvaluatedKey)
 * @returns User profiles and pagination token
 */
export async function searchUsersByUsername(
  query: string,
  limit: number = 20,
  nextToken?: string
): Promise<{ users: UserProfile[]; nextToken?: string }> {
  // Decode pagination token
  let exclusiveStartKey: Record<string, any> | undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
    } catch (error) {
      throw new Error('Invalid pagination token');
    }
  }

  // Scan for active users, then filter by username in code (case-insensitive)
  // Note: Blocked users will be filtered out in the handler after relationship check
  // DynamoDB doesn't support case-insensitive contains, so we filter in application layer
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression:
      'begins_with(PK, :pkPrefix) AND SK = :sk AND #isActive = :isActive AND #isBanned = :isBanned',
    ExpressionAttributeNames: {
      '#isActive': 'isActive',
      '#isBanned': 'isBanned',
    },
    ExpressionAttributeValues: {
      ':pkPrefix': 'USER#',
      ':sk': 'PROFILE',
      ':isActive': true,
      ':isBanned': false,
    },
    ExclusiveStartKey: exclusiveStartKey,
  });

  const response = await docClient.send(command);

  // Map DynamoDB items to UserProfile and filter by username (case-insensitive contains)
  const queryLower = query.toLowerCase();
  const allUsers = (response.Items || []).map(mapDynamoDBItemToProfile);
  const users = allUsers
    .filter((user) => user.username?.toLowerCase().includes(queryLower))
    .slice(0, limit);

  // Encode pagination token
  let encodedNextToken: string | undefined;
  if (response.LastEvaluatedKey) {
    encodedNextToken = Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64');
  }

  return {
    users,
    nextToken: encodedNextToken,
  };
}

/**
 * Map DynamoDB item to UserProfile
 *
 * @param item - DynamoDB item
 * @returns User profile
 */
function mapDynamoDBItemToProfile(item: Record<string, any>): UserProfile {
  return {
    userId: item.userId,
    username: item.username,
    email: item.email,
    fullName: item.fullName,
    avatarUrl: item.avatarUrl,
    backgroundUrl: item.backgroundUrl,
    bio: item.bio,
    birthday: item.birthday,
    gender: item.gender,
    country: item.country,
    isActive: item.isActive,
    isBanned: item.isBanned,
    isSuspended: item.isSuspended,
    lastLoginAt: item.lastLoginAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
