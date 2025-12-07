/**
 * Feed Service - GSI2 Queries
 *
 * Purpose: Public feed timeline and text search fallback
 * Index: GSI2 (public content feed)
 * Access Pattern: GSI2PK=POST#PUBLIC or CACHE#PUBLIC, GSI2SK=timestamp
 *
 * Performance: 100-200ms (feed), 2-5s (text search with filter)
 * Priority: HIGH - Core social feature
 */

import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface FeedOptions {
  limit?: number;
  cursor?: string; // Last evaluated key (timestamp)
}

export interface SearchOptions {
  query: string;
  source: 'POST#PUBLIC' | 'CACHE#PUBLIC';
  limit?: number;
}

export interface FeedResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

export class FeedService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook') {
    this.dynamoClient = new DynamoDBClient({});
    this.tableName = tableName;
  }

  /**
   * Get public feed (recent posts)
   *
   * Strategy: Query GSI2 with POST#PUBLIC, sort by timestamp descending
   *
   * @param options - Feed options with pagination
   * @returns Recent public posts
   *
   * Performance: 100-200ms
   */
  async getPublicFeed(options: FeedOptions = {}): Promise<FeedResult<any>> {
    const { limit = 20, cursor } = options;

    const params: any = {
      TableName: this.tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: marshall({
        ':pk': 'POST#PUBLIC',
      }),
      ScanIndexForward: false, // Newest first
      Limit: limit,
    };

    // Add cursor for pagination
    if (cursor) {
      params.ExclusiveStartKey = marshall({
        PK: cursor.split('#')[0],
        SK: cursor.split('#')[1],
        GSI2PK: 'POST#PUBLIC',
        GSI2SK: cursor.split('#')[2],
      });
    }

    const result = await this.dynamoClient.send(new QueryCommand(params));

    const items = result.Items?.map((item) => unmarshall(item)) || [];
    const nextCursor = result.LastEvaluatedKey
      ? `${unmarshall(result.LastEvaluatedKey).PK}#${unmarshall(result.LastEvaluatedKey).SK}#${unmarshall(result.LastEvaluatedKey).GSI2SK}`
      : undefined;

    return {
      items,
      cursor: nextCursor,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  /**
   * Get AI cache feed (recent AI recipes)
   *
   * Strategy: Query GSI2 with CACHE#PUBLIC, sort by timestamp descending
   *
   * @param options - Feed options with pagination
   * @returns Recent AI cache entries
   *
   * Performance: 100-200ms
   */
  async getAICacheFeed(options: FeedOptions = {}): Promise<FeedResult<any>> {
    const { limit = 20, cursor } = options;

    const params: any = {
      TableName: this.tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: marshall({
        ':pk': 'CACHE#PUBLIC',
      }),
      ScanIndexForward: false, // Newest first
      Limit: limit,
    };

    // Add cursor for pagination
    if (cursor) {
      params.ExclusiveStartKey = marshall({
        PK: cursor.split('#')[0],
        SK: cursor.split('#')[1],
        GSI2PK: 'CACHE#PUBLIC',
        GSI2SK: cursor.split('#')[2],
      });
    }

    const result = await this.dynamoClient.send(new QueryCommand(params));

    const items = result.Items?.map((item) => unmarshall(item)) || [];
    const nextCursor = result.LastEvaluatedKey
      ? `${unmarshall(result.LastEvaluatedKey).PK}#${unmarshall(result.LastEvaluatedKey).SK}#${unmarshall(result.LastEvaluatedKey).GSI2SK}`
      : undefined;

    return {
      items,
      cursor: nextCursor,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  /**
   * Text search using DynamoDB
   *
   * Strategy: Query GSI2 with FilterExpression for substring matching
   *
   * ⚠️ NOTE: This is slower than dedicated search services (2-5s)
   *
   * @param options - Search options with query and source
   * @returns Search results
   *
   * Performance: 2-5s (FilterExpression scan)
   */
  async searchText(options: SearchOptions): Promise<FeedResult<any>> {
    const { query, source, limit = 20 } = options;
    const queryLower = query.toLowerCase();

    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        FilterExpression: 'contains(searchableText, :query)',
        ExpressionAttributeValues: marshall({
          ':pk': source,
          ':query': queryLower,
        }),
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    const items = result.Items?.map((item) => unmarshall(item)) || [];

    return {
      items,
      hasMore: false, // No pagination for fallback search
    };
  }

  /**
   * Get combined feed (posts + AI cache)
   *
   * Strategy: Query both sources in parallel, merge by timestamp
   *
   * @param options - Feed options
   * @returns Combined feed sorted by timestamp
   *
   * Performance: 200-300ms
   */
  async getCombinedFeed(options: FeedOptions = {}): Promise<FeedResult<any>> {
    const { limit = 20 } = options;

    // Query both sources in parallel
    const [postsResult, cacheResult] = await Promise.all([
      this.getPublicFeed({ limit }),
      this.getAICacheFeed({ limit }),
    ]);

    // Merge and sort by timestamp
    const allItems = [...postsResult.items, ...cacheResult.items];
    allItems.sort((a, b) => {
      const timeA = new Date(a.GSI2SK || a.createdAt).getTime();
      const timeB = new Date(b.GSI2SK || b.createdAt).getTime();
      return timeB - timeA; // Newest first
    });

    // Take top N items
    const items = allItems.slice(0, limit);

    return {
      items,
      hasMore: allItems.length > limit,
    };
  }
}
