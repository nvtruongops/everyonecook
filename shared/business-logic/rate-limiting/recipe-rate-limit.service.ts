/**
 * Recipe Rate Limiting Service
 *
 * Implements rate limiting for recipe operations to prevent abuse.
 *
 * Rate Limits:
 * - CREATE_RECIPE: 10 per day (manual recipe creation)
 * - SAVE_FROM_FEED: 20 per day (importing recipes from feed)
 * - GENERATE_AI: 5 per day (AI recipe generation - uses AI rate limit)
 *
 * @see .kiro/specs/project-restructure/ai-services-design.md
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export enum RecipeOperation {
  CREATE_RECIPE = 'CREATE_RECIPE',
  SAVE_FROM_FEED = 'SAVE_FROM_FEED',
  GENERATE_AI = 'GENERATE_AI',
}

export const RECIPE_RATE_LIMITS: Record<RecipeOperation, number> = {
  [RecipeOperation.CREATE_RECIPE]: 10,
  [RecipeOperation.SAVE_FROM_FEED]: 20,
  [RecipeOperation.GENERATE_AI]: 5,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export class RecipeRateLimitService {
  private docClient: DynamoDBDocumentClient;

  constructor(private tableName: string) {
    const dynamoClient = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
  }

  async checkRateLimit(userId: string, operation: RecipeOperation): Promise<RateLimitResult> {
    const limit = RECIPE_RATE_LIMITS[operation];
    const today = this.getTodayKey();
    const resetAt = this.getResetTimestamp();
    const PK = `RATE_LIMIT#${userId}`;
    const SK = `RECIPE#${operation}#${today}`;

    try {
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: { PK, SK } })
      );
      const currentCount = result.Item?.count || 0;
      const remaining = Math.max(0, limit - currentCount);
      return { allowed: currentCount < limit, remaining, resetAt, limit };
    } catch (error) {
      console.error('Rate limit check failed:', { userId, operation, error });
      return { allowed: true, remaining: limit, resetAt, limit };
    }
  }

  async incrementUsage(userId: string, operation: RecipeOperation): Promise<void> {
    const today = this.getTodayKey();
    const ttl = this.getTTL();
    const PK = `RATE_LIMIT#${userId}`;
    const SK = `RECIPE#${operation}#${today}`;

    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK, SK },
          UpdateExpression: 'ADD #count :inc SET #ttl = :ttl, #updatedAt = :now',
          ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':inc': 1, ':ttl': ttl, ':now': Date.now() },
        })
      );
    } catch (error) {
      console.error('Failed to increment usage:', { userId, operation, error });
    }
  }

  async getCurrentUsage(userId: string, operation: RecipeOperation): Promise<number> {
    const today = this.getTodayKey();
    const PK = `RATE_LIMIT#${userId}`;
    const SK = `RECIPE#${operation}#${today}`;

    try {
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: { PK, SK } })
      );
      return result.Item?.count || 0;
    } catch (error) {
      console.error('Failed to get current usage:', { userId, operation, error });
      return 0;
    }
  }

  async resetRateLimit(userId: string, operation: RecipeOperation): Promise<void> {
    const today = this.getTodayKey();
    const PK = `RATE_LIMIT#${userId}`;
    const SK = `RECIPE#${operation}#${today}`;

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { PK, SK, count: 0, ttl: this.getTTL(), updatedAt: Date.now() },
        })
      );
    } catch (error) {
      console.error('Failed to reset rate limit:', { userId, operation, error });
      throw error;
    }
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getResetTimestamp(): number {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.getTime();
  }

  private getTTL(): number {
    return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  }
}
