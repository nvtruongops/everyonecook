/**
 * Get Activity Log Handler
 *
 * Admin endpoint to list recent admin activity logs.
 * Scans DynamoDB for ADMIN_ACTION entity types.
 *
 * GET /admin/activity?limit=20&lastKey=...&actionType=...
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
 * Admin Action Types
 */
const AdminActionTypes = [
  // User actions
  'BAN_USER',
  'UNBAN_USER',
  'DELETE_USER_CASCADE',
  'WARN_USER',
  // Post actions
  'DELETE_POST',
  'RESTORE_POST',
  'HIDE_POST',
  'RESTORE_CONTENT',
  'APPROVE_POST',
  'REJECT_POST',
  'DISMISS', // Dismiss post report
  // Comment actions
  'DELETE_COMMENT',
  'HIDE_COMMENT',
  'RESTORE_COMMENT',
  'COMMENT_WARN',
  'COMMENT_HIDE_COMMENT',
  'COMMENT_BAN_USER',
  'COMMENT_DISMISS',
  // Appeal actions
  'APPROVE_APPEAL',
  'REJECT_APPEAL',
  // System actions
  'CLEANUP_INACTIVE',
  'CLEANUP_USERS',
  'VIEW_SYSTEM_HEALTH',
  'VIEW_BUSINESS_METRICS',
  'VIEW_COST_DATA',
] as const;
type AdminActionType = (typeof AdminActionTypes)[number];

/**
 * Get Activity Query Schema
 */
const GetActivitySchema = z.object({
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20)
    .describe('Number of results to return'),

  lastKey: z.string().optional().describe('Pagination token from previous request'),

  actionType: z.enum(AdminActionTypes).optional().describe('Filter by specific action type'),
});

/**
 * Activity Log Item Interface
 */
interface ActivityLogItem {
  activityId: string;
  actionType: AdminActionType;
  adminUserId: string;
  adminUsername: string;
  targetUserId?: string;
  targetUsername?: string;
  targetPostId?: string;
  reason?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  timestamp: number;
  createdAt: string;
}

/**
 * Get Activity Log Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `admin-${Date.now()}`;

  console.log('[GetActivity] Starting handler', { correlationId });

  try {
    // 1. Authorization check
    requireAdminRole(event);

    // 2. Validate query parameters
    const query = validateInput(GetActivitySchema, {
      limit: event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20,
      lastKey: event.queryStringParameters?.lastKey,
      actionType: event.queryStringParameters?.actionType,
    });

    console.log('[GetActivity] Query params:', query);

    // 3. Build filter expression for ADMIN_ACTION entity type
    let filterExpression = 'entityType = :entityType';
    const expressionAttributeValues: Record<string, any> = {
      ':entityType': 'ADMIN_ACTION',
    };

    // Add action type filter if specified
    // Note: In DynamoDB, the field is 'action' not 'actionType'
    if (query.actionType) {
      filterExpression += ' AND #action = :actionType';
      expressionAttributeValues[':actionType'] = query.actionType;
    }
    // If no specific actionType filter, get ALL admin actions (no additional filter needed)
    // The entityType = 'ADMIN_ACTION' filter is sufficient

    // ExpressionAttributeNames for reserved word 'action'
    const expressionAttributeNames: Record<string, string> = {
      '#action': 'action',
    };

    // 4. Scan for activity logs - use pagination to handle large datasets
    const pageLimit = query.limit ?? 20;
    let allItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    // Scan with pagination - no Limit to let DynamoDB optimize
    // ProjectionExpression to reduce data transfer
    do {
      const scanParams: any = {
        TableName: TABLE_NAME,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: {
          ...expressionAttributeNames,
          '#ts': 'timestamp',
          '#md': 'metadata',
        },
        ProjectionExpression:
          'PK, actionId, #action, adminUserId, adminUsername, targetUserId, targetUsername, reason, #ts, #md, ipAddress, entityType',
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const result = await dynamoDB.send(new ScanCommand(scanParams));
      allItems = allItems.concat(result.Items || []);
      lastEvaluatedKey = result.LastEvaluatedKey;

      // Stop early if we have enough items (for performance)
      if (allItems.length >= 500) {
        console.log('[GetActivity] Reached 500 items, stopping scan early');
        break;
      }
    } while (lastEvaluatedKey);

    console.log('[GetActivity] Found', allItems.length, 'admin action items');

    // 5. Format and sort results by timestamp descending (newest first)
    let activities = allItems;

    // Sort by timestamp descending - ensure numeric comparison
    activities.sort((a, b) => {
      // Get timestamp as number (handle both number and ISO string formats)
      const getTimestamp = (item: any): number => {
        if (typeof item.timestamp === 'number') return item.timestamp;
        if (typeof item.timestamp === 'string') return new Date(item.timestamp).getTime();
        if (typeof item.createdAt === 'number') return item.createdAt;
        if (typeof item.createdAt === 'string') return new Date(item.createdAt).getTime();
        return 0;
      };
      return getTimestamp(b) - getTimestamp(a);
    });

    // Limit results
    const limitedActivities = activities.slice(0, pageLimit);

    // 6. Format response
    const formattedActivities: ActivityLogItem[] = limitedActivities.map((item) => ({
      activityId: item.actionId || item.PK?.replace('ADMIN_ACTION#', ''),
      actionType: item.action, // Field is 'action' in DynamoDB
      adminUserId: item.adminUserId,
      adminUsername: item.adminUsername || 'Unknown Admin',
      targetUserId: item.targetUserId,
      targetUsername: item.targetUsername,
      targetPostId: item.metadata?.postId,
      reason: item.reason,
      metadata: item.metadata,
      ipAddress: item.ipAddress,
      timestamp: item.timestamp,
      createdAt: new Date(item.timestamp).toISOString(),
    }));

    // 7. Client-side pagination - use offset-based since we have all data sorted
    // For simplicity, return all activities and let frontend handle pagination
    // This is acceptable since admin actions are typically < 1000 items

    // 8. Return success response
    return createSuccessResponse(
      200,
      {
        activities: formattedActivities,
        count: formattedActivities.length,
        total: activities.length,
        hasMore: activities.length > pageLimit,
      },
      correlationId
    );
  } catch (error) {
    console.error('[GetActivity] Handler error:', error);
    return handleError(error, correlationId);
  }
}
