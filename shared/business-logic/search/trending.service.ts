/**
 * Trending Service - GSI3 Queries
 *
 * Purpose: Get trending posts sorted by popularity
 * Index: GSI3 (trending posts)
 * Access Pattern: GSI3PK=POST#TRENDING, GSI3SK={likes}#{timestamp}
 *
 * Performance: 50-100ms
 * Priority: MEDIUM - Nice to have
 */

import { DynamoDBClient, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface TrendingOptions {
  limit?: number;
  minLikes?: number;
}

export class TrendingService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook') {
    this.dynamoClient = new DynamoDBClient({});
    this.tableName = tableName;
  }

  /**
   * Get trending posts
   *
   * Strategy: Query GSI3, sort by likes descending
   *
   * @param options - Trending options
   * @returns Trending posts sorted by popularity
   *
   * Performance: 50-100ms
   */
  async getTrending(options: TrendingOptions = {}): Promise<any[]> {
    const { limit = 10, minLikes = 0 } = options;

    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :trending',
        ExpressionAttributeValues: marshall({
          ':trending': 'POST#TRENDING',
        }),
        ScanIndexForward: false, // Highest likes first
        Limit: limit,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    const items = result.Items.map((item) => unmarshall(item));

    // Filter by minimum likes if specified
    if (minLikes > 0) {
      return items.filter((item) => item.likes >= minLikes);
    }

    return items;
  }

  /**
   * Update post popularity score (GSI3SK)
   *
   * Called when post receives like/unlike
   *
   * GSI3SK format: "{likes}#{timestamp}"
   * Example: "00025#2025-01-20T10:00:00Z"
   *
   * @param postId - Post ID
   * @param likes - New like count
   * @param createdAt - Post creation timestamp
   *
   * Performance: 20-30ms
   */
  async updatePopularity(postId: string, likes: number, createdAt: string): Promise<void> {
    // Format likes with leading zeros for proper sorting
    const likesFormatted = likes.toString().padStart(5, '0');
    const gsi3sk = `${likesFormatted}#${createdAt}`;

    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `POST#${postId}`,
          SK: 'METADATA',
        }),
        UpdateExpression: 'SET GSI3PK = :trending, GSI3SK = :sk, likes = :likes',
        ExpressionAttributeValues: marshall({
          ':trending': 'POST#TRENDING',
          ':sk': gsi3sk,
          ':likes': likes,
        }),
      })
    );
  }

  /**
   * Get trending posts by time range
   *
   * @param options - Trending options with time range
   * @returns Trending posts within time range
   *
   * Performance: 100-150ms
   */
  async getTrendingByTimeRange(
    startDate: string,
    endDate: string,
    options: TrendingOptions = {}
  ): Promise<any[]> {
    const { limit = 10 } = options;

    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :trending AND GSI3SK BETWEEN :start AND :end',
        ExpressionAttributeValues: marshall({
          ':trending': 'POST#TRENDING',
          ':start': `00000#${startDate}`,
          ':end': `99999#${endDate}`,
        }),
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => unmarshall(item));
  }

  /**
   * Remove post from trending (when deleted or hidden)
   *
   * @param postId - Post ID
   *
   * Performance: 20-30ms
   */
  async removeFromTrending(postId: string): Promise<void> {
    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `POST#${postId}`,
          SK: 'METADATA',
        }),
        UpdateExpression: 'REMOVE GSI3PK, GSI3SK',
      })
    );
  }
}
