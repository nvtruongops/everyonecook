/**
 * Admin Action Entity
 *
 * Represents an admin action for audit logging.
 * Stored in DynamoDB with GSI6 for admin activity queries.
 */

export interface AdminAction {
  // Primary Keys
  PK: string; // ADMIN_ACTION#{actionId}
  SK: string; // METADATA

  // GSI6 for admin activity queries
  GSI6PK: string; // ADMIN#{adminUserId}
  GSI6SK: string; // {timestamp}

  // Action Details
  actionId: string;
  adminUserId: string;
  adminUsername: string;
  action: AdminActionType;
  targetUserId: string;
  targetUsername?: string;
  reason: string;

  // Metadata
  ipAddress: string;
  userAgent?: string;
  timestamp: number;

  // Additional Context
  metadata?: Record<string, any>;

  // Entity Type
  entityType: 'ADMIN_ACTION';
}

export type AdminActionType =
  | 'BAN_USER'
  | 'UNBAN_USER'
  | 'DELETE_POST'
  | 'DELETE_COMMENT'
  | 'WARN_USER'
  | 'CLEANUP_INACTIVE'
  | 'CLEANUP_USERS'
  | 'DELETE_USER_CASCADE'
  | 'APPROVE_POST'
  | 'REJECT_POST'
  | 'RESTORE_POST'
  | 'RESTORE_CONTENT'
  | 'RESTORE_COMMENT'
  | 'VIEW_SYSTEM_HEALTH'
  | 'VIEW_BUSINESS_METRICS'
  | 'VIEW_COST_DATA'
  | 'APPROVE_APPEAL'
  | 'REJECT_APPEAL';

/**
 * Create Admin Action Entity
 *
 * Factory function to create an admin action entity.
 *
 * @param params - Admin action parameters
 * @returns Admin action entity
 */
export function createAdminAction(params: {
  adminUserId: string;
  adminUsername: string;
  action: AdminActionType;
  targetUserId: string | null;
  targetUsername?: string | null;
  reason: string;
  ipAddress: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}): AdminAction {
  const actionId = generateActionId();
  const timestamp = Date.now();

  return {
    PK: `ADMIN_ACTION#${actionId}`,
    SK: 'METADATA',
    GSI6PK: `ADMIN#${params.adminUserId}`,
    GSI6SK: timestamp.toString(),
    actionId,
    adminUserId: params.adminUserId,
    adminUsername: params.adminUsername,
    action: params.action,
    targetUserId: params.targetUserId || 'SYSTEM', // Use 'SYSTEM' for monitoring actions
    targetUsername: params.targetUsername || undefined,
    reason: params.reason,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    timestamp,
    metadata: params.metadata,
    entityType: 'ADMIN_ACTION',
  };
}

/**
 * Generate Action ID
 *
 * Generates a unique action ID using timestamp and random string.
 *
 * @returns Unique action ID
 */
function generateActionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}
