/**
 * Rate Limiting Middleware
 *
 * Prevents abuse of admin operations by limiting actions per hour.
 * - Soft limit: 50 actions/hour (warning)
 * - Hard limit: 100 actions/hour (block)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const SOFT_LIMIT = 50; // Warning threshold
const HARD_LIMIT = 100; // Block threshold
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class RateLimitError extends Error {
  statusCode: number;
  code: string;
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.code = 'RATE_LIMIT_EXCEEDED';
    this.retryAfter = retryAfter;
  }
}

interface RateLimitRecord {
  PK: string; // RATE_LIMIT#{adminUserId}
  SK: string; // ADMIN_ACTIONS
  count: number;
  windowStart: number;
  ttl: number; // Auto-cleanup after 2 hours
}

/**
 * Check Rate Limit
 *
 * Checks if admin has exceeded rate limits.
 * Throws RateLimitError if hard limit exceeded.
 * Logs warning if soft limit exceeded.
 *
 * @param adminUserId - Admin user ID
 * @throws RateLimitError if hard limit exceeded
 */
export async function checkRateLimit(adminUserId: string): Promise<void> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Get current rate limit record
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `RATE_LIMIT#${adminUserId}`,
        SK: 'ADMIN_ACTIONS',
      },
    })
  );

  const record = result.Item as RateLimitRecord | undefined;

  // Calculate current count
  let currentCount = 0;
  let currentWindowStart = now;

  if (record && record.windowStart > windowStart) {
    // Within current window
    currentCount = record.count;
    currentWindowStart = record.windowStart;
  }

  // Check hard limit
  if (currentCount >= HARD_LIMIT) {
    const retryAfter = Math.ceil((currentWindowStart + WINDOW_MS - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${HARD_LIMIT} actions per hour. Try again in ${retryAfter} seconds.`,
      retryAfter
    );
  }

  // Check soft limit (warning only)
  if (currentCount >= SOFT_LIMIT && currentCount < HARD_LIMIT) {
    console.warn('Admin rate limit soft threshold reached', {
      adminUserId,
      currentCount,
      softLimit: SOFT_LIMIT,
      hardLimit: HARD_LIMIT,
      remaining: HARD_LIMIT - currentCount,
    });

    // TODO: Send alert to admin team
    // await sendAdminAlert('Rate limit warning', { adminUserId, currentCount });
  }

  // Increment counter
  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `RATE_LIMIT#${adminUserId}`,
        SK: 'ADMIN_ACTIONS',
        count: currentCount + 1,
        windowStart: currentWindowStart,
        ttl: Math.floor((now + 2 * WINDOW_MS) / 1000), // Auto-cleanup after 2 hours
      },
    })
  );
}

/**
 * Get Rate Limit Status
 *
 * Returns current rate limit status for an admin.
 *
 * @param adminUserId - Admin user ID
 * @returns Rate limit status
 */
export async function getRateLimitStatus(adminUserId: string): Promise<{
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
}> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const result = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `RATE_LIMIT#${adminUserId}`,
        SK: 'ADMIN_ACTIONS',
      },
    })
  );

  const record = result.Item as RateLimitRecord | undefined;

  let currentCount = 0;
  let resetAt = now + WINDOW_MS;

  if (record && record.windowStart > windowStart) {
    currentCount = record.count;
    resetAt = record.windowStart + WINDOW_MS;
  }

  return {
    count: currentCount,
    limit: HARD_LIMIT,
    remaining: Math.max(0, HARD_LIMIT - currentCount),
    resetAt,
  };
}
