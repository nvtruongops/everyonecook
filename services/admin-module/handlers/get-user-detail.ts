/**
 * Get User Detail Handler
 *
 * Admin endpoint to get detailed user information including:
 * - User profile
 * - Violations history
 * - Ban history
 *
 * GET /admin/users/{userId}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { validateInput } from '../models/validation';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * User ID Path Parameter Schema
 */
const UserIdSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
});

/**
 * User Profile Interface
 */
interface UserProfile {
  userId: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  bannedBy?: string;
  banDuration?: number;
  banExpiresAt?: number | null;
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
  lastLoginAt?: number;
  recipeCount?: number;
  followerCount?: number;
  followingCount?: number;
}

/**
 * Violation Record Interface
 */
interface ViolationRecord {
  violationId: string;
  type: string;
  reason: string;
  createdAt: number;
  adminUserId?: string;
  relatedPostId?: string;
  status: string;
}

/**
 * Ban History Record Interface
 */
interface BanHistoryRecord {
  banId: string;
  bannedAt: number;
  bannedBy?: string;
  banReason: string;
  banDuration: number;
  banExpiresAt?: number | null;
  unbannedAt?: number;
  unbannedBy?: string;
  unbanReason?: string;
}

/**
 * User Detail Response Interface
 */
interface UserDetailResponse {
  profile: UserProfile;
  violations: ViolationRecord[];
  banHistory: BanHistoryRecord[];
  stats: {
    totalViolations: number;
    totalBans: number;
    currentlyBanned: boolean;
  };
}

/**
 * Get User Detail Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `admin-${Date.now()}`;

  console.log('[GetUserDetail] Starting handler', { correlationId, path: event.path });

  try {
    // 1. Authorization check
    requireAdminRole(event);

    // 2. Extract and validate userId from path
    const pathParts = event.path.split('/');
    const userIdFromPath = pathParts[pathParts.length - 1];

    const { userId } = validateInput(UserIdSchema, { userId: userIdFromPath });

    console.log('[GetUserDetail] Fetching user:', userId);

    // 3. Get user profile
    const profileResult = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      })
    );

    if (!profileResult.Item) {
      return createSuccessResponse(404, { error: 'User not found', userId }, correlationId);
    }

    const profileItem = profileResult.Item;
    const profile: UserProfile = {
      userId: profileItem.userId || userId,
      username: profileItem.username,
      email: profileItem.email,
      displayName: profileItem.displayName,
      avatarUrl: profileItem.avatarUrl,
      bio: profileItem.bio,
      isBanned: profileItem.isBanned || false,
      banReason: profileItem.banReason,
      bannedAt: profileItem.bannedAt,
      bannedBy: profileItem.bannedBy,
      banDuration: profileItem.banDuration,
      banExpiresAt: profileItem.banExpiresAt,
      isActive: profileItem.isActive ?? true,
      createdAt: profileItem.createdAt,
      updatedAt: profileItem.updatedAt,
      lastLoginAt: profileItem.lastLoginAt,
      recipeCount: profileItem.recipeCount || 0,
      followerCount: profileItem.followerCount || 0,
      followingCount: profileItem.followingCount || 0,
    };

    // 4. Get violations for this user
    const violations = await getViolations(userId);

    // 5. Get ban history for this user
    const banHistory = await getBanHistory(userId);

    // 6. Build response
    const response: UserDetailResponse = {
      profile,
      violations,
      banHistory,
      stats: {
        totalViolations: violations.length,
        totalBans: banHistory.length,
        currentlyBanned: profile.isBanned,
      },
    };

    return createSuccessResponse(200, response, correlationId);
  } catch (error) {
    console.error('[GetUserDetail] Handler error:', error);
    return handleError(error, correlationId);
  }
}

/**
 * Get Violations for a User
 *
 * Queries DynamoDB for violation records associated with the user.
 */
async function getViolations(userId: string): Promise<ViolationRecord[]> {
  try {
    // Query violations using GSI or scan with filter
    // Pattern: PK = USER#{userId}, SK begins_with VIOLATION#
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'VIOLATION#',
        },
        ScanIndexForward: false, // Most recent first
      })
    );

    return (result.Items || []).map((item) => ({
      violationId: item.violationId || item.SK?.replace('VIOLATION#', ''),
      type: item.type || 'unknown',
      reason: item.reason || item.banReason || '',
      createdAt: item.createdAt || item.bannedAt || 0,
      adminUserId: item.adminUserId || item.bannedBy,
      relatedPostId: item.relatedPostId,
      status: item.status || 'recorded',
    }));
  } catch (error) {
    console.warn('[GetUserDetail] Error fetching violations:', error);
    return [];
  }
}

/**
 * Get Ban History for a User
 *
 * Queries DynamoDB for ban history records associated with the user.
 */
async function getBanHistory(userId: string): Promise<BanHistoryRecord[]> {
  try {
    // Query ban history using pattern: PK = USER#{userId}, SK begins_with BAN#
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'BAN#',
        },
        ScanIndexForward: false, // Most recent first
      })
    );

    return (result.Items || []).map((item) => ({
      banId: item.banId || item.SK?.replace('BAN#', ''),
      bannedAt: item.bannedAt || item.createdAt || 0,
      bannedBy: item.bannedBy || item.adminUserId,
      banReason: item.banReason || item.reason || '',
      banDuration: item.banDuration || 0,
      banExpiresAt: item.banExpiresAt,
      unbannedAt: item.unbannedAt,
      unbannedBy: item.unbannedBy,
      unbanReason: item.unbanReason,
    }));
  } catch (error) {
    console.warn('[GetUserDetail] Error fetching ban history:', error);
    return [];
  }
}
