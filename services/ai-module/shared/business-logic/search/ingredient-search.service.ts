/**
 * Ingredient Search Service - GSI4 Queries
 *
 * Purpose: Search by ingredients across AI cache and social posts
 * Index: GSI4 (ingredient-based search)
 * Access Pattern: GSI4PK=POST_INGREDIENT#{name} or CACHE_INGREDIENT#{name}
 *
 * Performance: 50-100ms per ingredient
 * Priority: HIGH - Core search feature
 */

import { DynamoDBClient, QueryCommand, BatchGetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface IngredientSearchOptions {
  ingredients: string[]; // Normalized English ingredients
  limit?: number;
  cursor?: string;
}

export interface SearchResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

export class IngredientSearchService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook') {
    this.dynamoClient = new DynamoDBClient({});
    this.tableName = tableName;
  }

  /**
   * Search AI cache by ingredients
   *
   * Strategy: Query GSI4 for each ingredient, find intersection
   *
   * @param options - Search options with ingredients
   * @returns AI cache entries containing ALL ingredients
   *
   * Performance: 50-100ms per ingredient + intersection
   */
  async searchAICache(options: IngredientSearchOptions): Promise<SearchResult<any>> {
    const { ingredients, limit = 20 } = options;

    if (ingredients.length === 0) {
      return { items: [], hasMore: false };
    }

    // Query GSI4 for each ingredient in parallel
    const results = await Promise.all(
      ingredients.map((ing) => this.queryIngredient(`CACHE_INGREDIENT#${ing}`))
    );

    // Find intersection (cache entries with ALL ingredients)
    const cacheIds = this.findIntersection(results);

    // Fetch full cache entries
    const items = await this.batchGetCacheEntries(cacheIds.slice(0, limit));

    return {
      items,
      hasMore: cacheIds.length > limit,
      cursor: cacheIds.length > limit ? cacheIds[limit] : undefined,
    };
  }

  /**
   * Search social posts by ingredients
   *
   * Strategy: Query GSI4 for each ingredient, find intersection
   *
   * @param options - Search options with ingredients
   * @returns Social posts containing ALL ingredients
   *
   * Performance: 50-100ms per ingredient + intersection
   */
  async searchSocialPosts(options: IngredientSearchOptions): Promise<SearchResult<any>> {
    const { ingredients, limit = 20 } = options;

    if (ingredients.length === 0) {
      return { items: [], hasMore: false };
    }

    // Query GSI4 for each ingredient in parallel
    const results = await Promise.all(
      ingredients.map((ing) => this.queryIngredient(`POST_INGREDIENT#${ing}`))
    );

    // Find intersection (posts with ALL ingredients)
    const postIds = this.findIntersection(results);

    // Fetch full post entries
    const items = await this.batchGetPosts(postIds.slice(0, limit));

    return {
      items,
      hasMore: postIds.length > limit,
      cursor: postIds.length > limit ? postIds[limit] : undefined,
    };
  }

  /**
   * Query GSI4 for a single ingredient
   *
   * @param gsi4pk - GSI4PK value (POST_INGREDIENT# or CACHE_INGREDIENT#)
   * @returns Array of item IDs
   */
  private async queryIngredient(gsi4pk: string): Promise<string[]> {
    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI4',
        KeyConditionExpression: 'GSI4PK = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': gsi4pk,
        }),
        ProjectionExpression: 'GSI4SK',
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Extract IDs from GSI4SK (e.g., "POST#post123" → "post123")
    return result.Items.map((item) => {
      const unmarshalled = unmarshall(item);
      const gsi4sk = unmarshalled.GSI4SK as string;
      return gsi4sk.split('#')[1]; // Extract ID
    });
  }

  /**
   * Find intersection of multiple arrays (items with ALL ingredients)
   *
   * @param arrays - Array of ID arrays
   * @returns IDs present in ALL arrays
   */
  private findIntersection(arrays: string[][]): string[] {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];

    // Start with first array
    let intersection = new Set(arrays[0]);

    // Intersect with remaining arrays
    for (let i = 1; i < arrays.length; i++) {
      const currentSet = new Set(arrays[i]);
      intersection = new Set([...intersection].filter((id) => currentSet.has(id)));
    }

    return Array.from(intersection);
  }

  /**
   * Batch get AI cache entries
   *
   * @param cacheIds - Array of cache IDs
   * @returns Array of cache entries
   */
  private async batchGetCacheEntries(cacheIds: string[]): Promise<any[]> {
    if (cacheIds.length === 0) return [];

    const keys = cacheIds.map((id) =>
      marshall({
        PK: `AI_CACHE#${id}`,
        SK: 'METADATA',
      })
    );

    const result = await this.dynamoClient.send(
      new BatchGetItemCommand({
        RequestItems: {
          [this.tableName]: {
            Keys: keys,
          },
        },
      })
    );

    if (!result.Responses || !result.Responses[this.tableName]) {
      return [];
    }

    return result.Responses[this.tableName].map((item) => unmarshall(item));
  }

  /**
   * Batch get social posts
   *
   * @param postIds - Array of post IDs
   * @returns Array of posts
   */
  private async batchGetPosts(postIds: string[]): Promise<any[]> {
    if (postIds.length === 0) return [];

    const keys = postIds.map((id) =>
      marshall({
        PK: `POST#${id}`,
        SK: 'METADATA',
      })
    );

    const result = await this.dynamoClient.send(
      new BatchGetItemCommand({
        RequestItems: {
          [this.tableName]: {
            Keys: keys,
          },
        },
      })
    );

    if (!result.Responses || !result.Responses[this.tableName]) {
      return [];
    }

    return result.Responses[this.tableName].map((item) => unmarshall(item));
  }
}
