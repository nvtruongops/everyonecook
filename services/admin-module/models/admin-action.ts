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

  // TTL for auto-cleanup (next Monday after 1 week)
  ttl: number;

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
  | 'REJECT_APPEAL'
  | 'ARCHIVE_REPORTS'
  | 'ARCHIVE_ACTIVITY';

/**
 * Create Admin Action Entity
 *
 * Factory function to create an admin action entity.
 *
 * @param params - Admin action parameters
 * @returns Admin action entity
 */
/**
 * Calculate TTL for next Monday after 1 week
 * Activity logs will be auto-deleted on Monday of the week after next
 */
function calculateNextMondayTTL(): number {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  
  // Calculate days until next Monday (if today is Monday, go to next week's Monday)
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  
  // Add 7 more days to get Monday after next week (total ~1-2 weeks retention)
  const daysToAdd = daysUntilMonday + 7;
  
  const targetDate = new Date(now);
  targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
  targetDate.setUTCHours(0, 0, 0, 0); // Start of day
  
  return Math.floor(targetDate.getTime() / 1000);
}

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
    ttl: calculateNextMondayTTL(),
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
