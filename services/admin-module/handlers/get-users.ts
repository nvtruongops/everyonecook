/**
 * Get All Users Handler
 *
 * Admin endpoint to list all users with pagination and filtering.
 *
 * GET /admin/users?limit=10&page=1&status=all&search=...
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { validateInput } from '../models/validation';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Get Users Query Schema
 */
const GetUsersSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  page: z.number().int().min(1).optional().default(1),
  status: z.enum(['all', 'active', 'banned']).optional().default('all'),
  search: z.string().max(100).optional(),
});

interface UserListItem {
  userId: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  createdAt: number;
  lastLoginAt?: number;
  violationCount?: number;
  warningCount?: number;
  deletedPostCount?: number;
  deletedCommentCount?: number;
  banCount?: number;
  postCount?: number;
  recipeCount?: number;
}

/**
 * Get All Users Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `admin-${Date.now()}`;

  console.log('[GetUsers] Starting handler', { correlationId });

  try {
    requireAdminRole(event);

    const query = validateInput(GetUsersSchema, {
      limit: event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 10,
      page: event.queryStringParameters?.page ? parseInt(event.queryStringParameters.page) : 1,
      status: event.queryStringParameters?.status || 'all',
      search: event.queryStringParameters?.search,
    });

    console.log('[GetUsers] Query params:', query);

    // Scan all users with PROFILE SK
    const allUsers: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const scanParams: any = {
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'PROFILE' },
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDB.send(new ScanCommand(scanParams));
      allUsers.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log('[GetUsers] Total users scanned:', allUsers.length);

    // Apply filters
    let filteredUsers = allUsers;

    // Exclude admin users from the list (admin cannot ban/delete themselves)
    filteredUsers = filteredUsers.filter(
      (u) => u.username?.toLowerCase() !== 'admin' && !u.username?.toLowerCase().startsWith('admin_')
    );

    // Status filter
    if (query.status === 'active') {
      filteredUsers = filteredUsers.filter((u) => !u.isBanned);
    } else if (query.status === 'banned') {
      filteredUsers = filteredUsers.filter((u) => u.isBanned === true);
    }

    // Search filter
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filteredUsers = filteredUsers.filter(
        (user) =>
          user.username?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.displayName?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by createdAt descending (newest first)
    filteredUsers.sort((a, b) => {
      const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
      const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    const total = filteredUsers.length;
    const limit = query.limit ?? 10;
    const totalPages = Math.ceil(total / limit);
    const page = Math.min(query.page ?? 1, totalPages || 1);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    // Count posts for each user in current page
    const postCounts = await Promise.all(
      paginatedUsers.map(async (user) => {
        const userId = user.userId || user.PK?.replace('USER#', '');
        try {
          // Query posts by authorId using GSI or scan with filter
          const result = await dynamoDB.send(
            new ScanCommand({
              TableName: TABLE_NAME,
              FilterExpression: 'begins_with(PK, :pk) AND SK = :sk AND authorId = :authorId',
              ExpressionAttributeValues: {
                ':pk': 'POST#',
                ':sk': 'METADATA',
                ':authorId': userId,
              },
              Select: 'COUNT',
            })
          );
          return { userId, count: result.Count || 0 };
        } catch {
          return { userId, count: 0 };
        }
      })
    );

    const postCountMap = new Map(postCounts.map((p) => [p.userId, p.count]));

    // Format response
    const formattedUsers: UserListItem[] = paginatedUsers.map((item) => {
      const userId = item.userId || item.PK?.replace('USER#', '');
      return {
        userId,
        username: item.username,
        email: item.email,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
        isActive: item.isActive !== false && !item.isBanned,
        isBanned: item.isBanned || false,
        banReason: item.banReason,
        bannedAt: item.bannedAt,
        createdAt: item.createdAt,
        lastLoginAt: item.lastLoginAt,
        violationCount: item.violationCount || 0,
        warningCount: item.warningCount || 0,
        deletedPostCount: item.deletedPostCount || 0,
        deletedCommentCount: item.deletedCommentCount || 0,
        banCount: item.banCount || 0,
        postCount: postCountMap.get(userId) || item.postCount || 0,
        recipeCount: item.recipeCount || 0,
      };
    });

    return createSuccessResponse(
      200,
      {
        users: formattedUsers,
        count: formattedUsers.length,
        total,
        page,
        totalPages,
        hasMore: page < totalPages,
      },
      correlationId
    );
  } catch (error) {
    console.error('[GetUsers] Handler error:', error);
    return handleError(error, correlationId);
  }
}
