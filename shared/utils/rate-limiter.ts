/**
 * Rate Limiter Utility (Shared)
 *
 * Provides rate limiting functionality using DynamoDB with TTL-based cleanup.
 * Can be used across all modules (auth, upload, social, etc.)
 *
 * @module shared/utils/rate-limiter
 * @see .kiro/specs/project-restructure/security-architecture.md - Rate Limiting
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  operation: string;
  maxAttempts: number;
  windowSeconds: number;
}

/**
 * Check if user has exceeded rate limit
 *
 * @param userId - User ID
 * @param config - Rate limit configuration
 * @returns True if rate limit exceeded
 */
export async function checkRateLimit(userId: string, config: RateLimitConfig): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  // Get rate limit record
  const getCommand = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `RATE_LIMIT#${userId}`,
      SK: `OPERATION#${config.operation}`,
    },
  });

  const response = await docClient.send(getCommand);

  if (!response.Item) {
    // First attempt - create record
    await createRateLimitRecord(userId, config.operation, now, 1, config.windowSeconds);
    return false;
  }

  const record = response.Item;

  // Check if window has expired
  if (record.windowStart < windowStart) {
    // Reset counter
    await createRateLimitRecord(userId, config.operation, now, 1, config.windowSeconds);
    return false;
  }

  // Check if limit exceeded
  if (record.attempts >= config.maxAttempts) {
    return true;
  }

  // Increment counter
  await createRateLimitRecord(
    userId,
    config.operation,
    record.windowStart,
    record.attempts + 1,
    config.windowSeconds
  );
  return false;
}

/**
 * Create or update rate limit record
 *
 * @param userId - User ID
 * @param operation - Operation name
 * @param windowStart - Window start timestamp
 * @param attempts - Number of attempts
 * @param windowSeconds - Window duration in seconds
 */
async function createRateLimitRecord(
  userId: string,
  operation: string,
  windowStart: number,
  attempts: number,
  windowSeconds: number
): Promise<void> {
  const ttl = Math.floor((windowStart + windowSeconds * 1000) / 1000) + 86400; // +1 day buffer

  const putCommand = new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `RATE_LIMIT#${userId}`,
      SK: `OPERATION#${operation}`,
      windowStart,
      attempts,
      ttl,
    },
  });

  await docClient.send(putCommand);
}

/**
 * Common rate limit configurations
 *
 * Modules can use these or define their own
 */
export const RATE_LIMITS = {
  // Auth Module
  PROFILE_UPDATE: {
    operation: 'profile_update',
    maxAttempts: 10,
    windowSeconds: 900, // 15 minutes
  },
  AVATAR_UPLOAD: {
    operation: 'avatar_upload',
    maxAttempts: 10,
    windowSeconds: 86400, // 1 day
  },
  BACKGROUND_UPLOAD: {
    operation: 'background_upload',
    maxAttempts: 10,
    windowSeconds: 86400, // 1 day
  },

  // Upload Module
  POST_IMAGE_UPLOAD: {
    operation: 'post_image_upload',
    maxAttempts: 10,
    windowSeconds: 86400, // 1 day
  },
  RECIPE_IMAGE_UPLOAD: {
    operation: 'recipe_image_upload',
    maxAttempts: 10,
    windowSeconds: 86400, // 1 day
  },

  // Social Module
  POST_CREATE: {
    operation: 'post_create',
    maxAttempts: 20,
    windowSeconds: 86400, // 1 day
  },
  COMMENT_CREATE: {
    operation: 'comment_create',
    maxAttempts: 50,
    windowSeconds: 3600, // 1 hour
  },

  // AI Module
  AI_RECIPE_GENERATION: {
    operation: 'ai_recipe_generation',
    maxAttempts: 10,
    windowSeconds: 86400, // 1 day
  },
  RECIPE_CREATE: {
    operation: 'recipe_create',
    maxAttempts: 20,
    windowSeconds: 86400, // 1 day
  },
};
