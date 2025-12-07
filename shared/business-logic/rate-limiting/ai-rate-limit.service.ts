/**
 * AI Rate Limiting Service
 *
 * Purpose: Limit AI requests to 5 calls per user per day (regardless of cache hit)
 * Storage: DynamoDB with 24-hour TTL
 * Access Pattern: PK=RATE_LIMIT#AI#{userId}, SK=DATE#{YYYY-MM-DD}
 *
 * Business Rules:
 * - Max 5 AI suggestions per user per day
 * - Count both cache hits and cache misses
 * - Reset daily at midnight UTC
 * - Permanent users have no limit
 *
 * Cost Impact:
 * - Prevents abuse: Max $0.10/user/day (5 × $0.02)
 * - DynamoDB reads: ~$0.000001 per check
 * - DynamoDB writes: ~$0.000005 per increment
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetAt: number; // Unix timestamp (ms)
  message?: string;
}

export class AIRateLimitService {
  private dynamoClient: DynamoDBClient;
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  // Rate limit configuration
  private readonly DAILY_LIMIT = 5; // 5 AI suggestions per day
  private readonly TTL_HOURS = 24; // 24 hours TTL

  constructor(tableName?: string) {
    const table = tableName || process.env.DYNAMODB_TABLE;

    if (!table) {
      throw new Error('DYNAMODB_TABLE environment variable is required or must be provided');
    }

    this.tableName = table;
    this.dynamoClient = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
  }

  /**
   * Check if user has exceeded rate limit
   *
   * @param userId - User ID from JWT token
   * @returns Rate limit result
   */
  async checkLimit(userId: string): Promise<RateLimitResult> {
    const today = this.getToday(); // YYYY-MM-DD format
    const PK = `RATE_LIMIT#AI#${userId}`;
    const SK = `DATE#${today}`;

    try {
      // Get current count
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK, SK },
        })
      );

      const currentCount = result.Item?.count || 0;
      const allowed = currentCount < this.DAILY_LIMIT;

      // Calculate reset time (midnight UTC today + 24 hours)
      const resetAt = this.getResetTimestamp();

      if (!allowed) {
        return {
          allowed: false,
          currentCount,
          limit: this.DAILY_LIMIT,
          resetAt,
          message: `Daily limit of ${this.DAILY_LIMIT} AI suggestions exceeded. Resets at ${new Date(resetAt).toISOString()}`,
        };
      }

      return {
        allowed: true,
        currentCount,
        limit: this.DAILY_LIMIT,
        resetAt,
      };
    } catch (error) {
      console.error('Rate limit check failed', { userId, error });
      // On error, allow request (fail open)
      return {
        allowed: true,
        currentCount: 0,
        limit: this.DAILY_LIMIT,
        resetAt: this.getResetTimestamp(),
        message: 'Rate limit check failed - allowing request',
      };
    }
  }

  /**
   * Increment rate limit counter (atomic)
   *
   * @param userId - User ID from JWT token
   * @returns Updated rate limit result
   */
  async incrementCount(userId: string): Promise<RateLimitResult> {
    const today = this.getToday(); // YYYY-MM-DD format
    const PK = `RATE_LIMIT#AI#${userId}`;
    const SK = `DATE#${today}`;
    const ttl = Math.floor(Date.now() / 1000) + this.TTL_HOURS * 60 * 60; // 24 hours from now

    try {
      // Atomic increment with conditional check
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK, SK },
          UpdateExpression:
            'SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl, #updatedAt = :now',
          ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit', // Only increment if under limit
          ExpressionAttributeNames: {
            '#count': 'count',
            '#ttl': 'ttl',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':inc': 1,
            ':limit': this.DAILY_LIMIT,
            ':ttl': ttl,
            ':now': Date.now(),
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      const newCount = result.Attributes?.count || 1;
      const resetAt = this.getResetTimestamp();

      return {
        allowed: newCount <= this.DAILY_LIMIT,
        currentCount: newCount,
        limit: this.DAILY_LIMIT,
        resetAt,
      };
    } catch (error: any) {
      // ConditionalCheckFailedException means limit exceeded
      if (error.name === 'ConditionalCheckFailedException') {
        const resetAt = this.getResetTimestamp();
        return {
          allowed: false,
          currentCount: this.DAILY_LIMIT,
          limit: this.DAILY_LIMIT,
          resetAt,
          message: `Daily limit of ${this.DAILY_LIMIT} AI suggestions exceeded. Resets at ${new Date(resetAt).toISOString()}`,
        };
      }

      console.error('Rate limit increment failed', { userId, error });
      throw error;
    }
  }

  /**
   * Get today's date in YYYY-MM-DD format (UTC)
   *
   * @returns Date string
   */
  private getToday(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get reset timestamp (midnight UTC tomorrow)
   *
   * @returns Unix timestamp (ms)
   */
  private getResetTimestamp(): number {
    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
    );
    return tomorrow.getTime();
  }

  /**
   * Get current usage for user (for display purposes)
   *
   * @param userId - User ID
   * @returns Current count and limit
   */
  async getCurrentUsage(
    userId: string
  ): Promise<{ count: number; limit: number; resetAt: number }> {
    const result = await this.checkLimit(userId);
    return {
      count: result.currentCount,
      limit: result.limit,
      resetAt: result.resetAt,
    };
  }

  /**
   * Reset rate limit for user (admin only)
   *
   * @param userId - User ID
   */
  async resetLimit(userId: string): Promise<void> {
    const today = this.getToday();
    const PK = `RATE_LIMIT#AI#${userId}`;
    const SK = `DATE#${today}`;

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK, SK },
        UpdateExpression: 'SET #count = :zero',
        ExpressionAttributeNames: {
          '#count': 'count',
        },
        ExpressionAttributeValues: {
          ':zero': 0,
        },
      })
    );

    console.log('Rate limit reset for user', { userId, date: today });
  }
}
