/**
 * Audit Log Service
 *
 * Handles audit logging for admin actions.
 * Creates ADMIN_ACTION entities in DynamoDB with GSI6 for queries.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AdminAction, AdminActionType, createAdminAction } from '../models/admin-action';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

export class AuditLogService {
  /**
   * Log Admin Action
   *
   * Creates an audit log entry for an admin action.
   *
   * @param params - Admin action parameters
   * @returns Created admin action entity
   */
  async logAction(params: {
    adminUserId: string;
    adminUsername: string;
    action: AdminActionType;
    targetUserId: string | null;
    targetUsername?: string | null;
    reason: string;
    ipAddress: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<AdminAction> {
    const adminAction = createAdminAction(params);

    await dynamoDB.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: adminAction,
      })
    );

    console.log('Admin action logged', {
      actionId: adminAction.actionId,
      adminUserId: params.adminUserId,
      action: params.action,
      targetUserId: params.targetUserId,
    });

    return adminAction;
  }

  /**
   * Get Admin Activity
   *
   * Retrieves admin activity history using GSI6.
   *
   * @param adminUserId - Admin user ID
   * @param limit - Maximum number of results
   * @param lastEvaluatedKey - Pagination token
   * @returns Admin actions and pagination token
   */
  async getAdminActivity(
    adminUserId: string,
    limit: number = 20,
    lastEvaluatedKey?: Record<string, any>
  ): Promise<{
    actions: AdminAction[];
    lastEvaluatedKey?: Record<string, any>;
  }> {
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI6',
        KeyConditionExpression: 'GSI6PK = :adminId',
        ExpressionAttributeValues: {
          ':adminId': `ADMIN#${adminUserId}`,
        },
        ScanIndexForward: false, // Sort by timestamp descending (newest first)
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    return {
      actions: (result.Items || []) as AdminAction[],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get Action by ID
   *
   * Retrieves a specific admin action by ID.
   *
   * @param actionId - Action ID
   * @returns Admin action or null if not found
   */
  async getActionById(actionId: string): Promise<AdminAction | null> {
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `ADMIN_ACTION#${actionId}`,
          ':sk': 'METADATA',
        },
      })
    );

    return (result.Items?.[0] as AdminAction) || null;
  }
}
