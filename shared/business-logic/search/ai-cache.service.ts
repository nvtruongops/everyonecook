/**
 * AI Cache Service - 24h TTL
 *
 * Purpose: Store AI-generated recipes with exact/partial matching
 * Storage: DynamoDB with 24-hour TTL
 * Access Patterns:
 * - Exact match: PK=AI_CACHE#{cacheKey}, SK=METADATA
 * - Partial match: GSI4 (ingredient-based)
 *
 * Performance: 50ms (exact), 200ms (partial)
 * Priority: HIGH - Core AI feature
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IngredientSearchService } from './ingredient-search.service';

export interface AICacheEntry {
  PK: string; // "AI_CACHE#{cacheKey}"
  SK: 'METADATA';
  cacheKey: string;
  recipes: any[];
  settings: {
    servings: number;
    mealType: string;
    maxTime: number;
    preferredCookingMethods: string[];
    dislikedIngredients: string[];
  };
  createdAt: string;
  ttl: number; // 24 hours from now

  // ✅ GSI2 for text search fallback
  GSI2PK: 'CACHE#PUBLIC';
  GSI2SK: string; // createdAt timestamp
  searchableText: string; // Lowercase: title + ingredients

  // GSI4 handled by separate ingredient index items
}

export interface StoreOptions {
  cacheKey: string; // Cache key from user input
  recipes: any[];
  userInputIngredients: string[]; // Original user input (3 items: pork-belly, tomato, onion)
  allRecipeIngredients: string[]; // All ingredients from AI recipes (6 items: pork-belly, tomato, onion, egg, fish-sauce, sugar)
  settings: any;
}

export class AICacheService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;
  private ingredientSearch: IngredientSearchService;

  constructor(tableName?: string) {
    // Use provided tableName or get from environment (required)
    const table = tableName || process.env.DYNAMODB_TABLE;

    if (!table) {
      throw new Error('DYNAMODB_TABLE environment variable is required or must be provided');
    }

    this.tableName = table;
    this.dynamoClient = new DynamoDBClient({});
    this.ingredientSearch = new IngredientSearchService(this.tableName);
  }

  /**
   * Get exact match by cache key
   *
   * @param cacheKey - Generated cache key
   * @returns Cached entry or null
   *
   * Performance: 50ms
   */
  async getExact(cacheKey: string): Promise<AICacheEntry | null> {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `AI_CACHE#${cacheKey}`,
          SK: 'METADATA',
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as AICacheEntry;
  }

  /**
   * Get partial match via GSI4
   *
   * Strategy: Find cache entries containing subset of user ingredients
   *
   * @param ingredients - Normalized English ingredients
   * @returns Array of cache entries
   *
   * Performance: 200ms
   */
  async getPartial(ingredients: string[]): Promise<AICacheEntry[]> {
    const result = await this.ingredientSearch.searchAICache({
      ingredients,
      limit: 10,
    });

    return result.items;
  }

  /**
   * Store AI-generated recipe with indexes
   *
   * Creates:
   * 1. Main cache entry with GSI2 fields
   * 2. Ingredient indexes for GSI4
   *
   * @param options - Store options
   *
   * Performance: 100-150ms
   */
  async store(options: StoreOptions): Promise<void> {
    const { cacheKey, recipes, userInputIngredients, allRecipeIngredients, settings } = options;
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours

    // Generate searchable text (lowercase)
    const searchableText = this.generateSearchableText(recipes, allRecipeIngredients);

    // Main cache entry
    const cacheEntry: AICacheEntry = {
      PK: `AI_CACHE#${cacheKey}`,
      SK: 'METADATA',
      cacheKey,
      recipes,
      settings,
      createdAt: now,
      ttl,

      // GSI2 for text search fallback
      GSI2PK: 'CACHE#PUBLIC',
      GSI2SK: now,
      searchableText,
    };

    // Store main entry
    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(cacheEntry),
      })
    );

    // Create ingredient indexes for GSI4
    // Strategy: Index ALL recipe ingredients (not just user input)
    // This enables partial matching: user searches subset → finds full recipe
    await this.createIngredientIndexes(cacheKey, allRecipeIngredients, ttl);

    console.log('AI Cache stored with dual strategy', {
      cacheKey,
      userInputCount: userInputIngredients.length,
      fullRecipeCount: allRecipeIngredients.length,
      userInput: userInputIngredients,
      fullRecipe: allRecipeIngredients,
    });
  }

  /**
   * Create ingredient indexes for GSI4
   *
   * @param cacheKey - Cache key
   * @param ingredients - Normalized English ingredients
   * @param ttl - TTL timestamp
   */
  private async createIngredientIndexes(
    cacheKey: string,
    ingredients: string[],
    ttl: number
  ): Promise<void> {
    if (ingredients.length === 0) return;

    // Create index items
    const indexItems = ingredients.map((ingredient) => ({
      PutRequest: {
        Item: marshall({
          PK: `AI_CACHE#${cacheKey}`,
          SK: `INGREDIENT#${ingredient}`,
          GSI4PK: `CACHE_INGREDIENT#${ingredient}`,
          GSI4SK: `AI_CACHE#${cacheKey}`,
          ingredientName: ingredient,
          ttl,
        }),
      },
    }));

    // Batch write (max 25 items per request)
    const batches = this.chunkArray(indexItems, 25);

    for (const batch of batches) {
      await this.dynamoClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [this.tableName]: batch,
          },
        })
      );
    }
  }

  /**
   * Generate searchable text for GSI2 fallback
   *
   * @param recipes - Recipe array
   * @param ingredients - Ingredient array
   * @returns Lowercase searchable text
   */
  private generateSearchableText(recipes: any[], ingredients: string[]): string {
    const titles = recipes.map((r) => r.name?.vietnamese || r.name?.english || '').join(' ');
    const ingredientsText = ingredients.join(' ');

    return `${titles} ${ingredientsText}`.toLowerCase();
  }

  /**
   * Chunk array into smaller arrays
   *
   * @param array - Input array
   * @param size - Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Generate cache key from ingredients and settings
   *
   * @param ingredients - Sorted normalized ingredients
   * @param settings - User settings
   * @returns Cache key string
   */
  static generateCacheKey(ingredients: string[], settings: any): string {
    const sortedIngredients = [...ingredients].sort().join('|');
    const cookingMethods = (settings.preferredCookingMethods || []).sort().join('-');
    const disliked = (settings.dislikedIngredients || []).sort().join('-');

    return `${sortedIngredients}|s${settings.servings}|${settings.mealType}|t${settings.maxTime}|${cookingMethods}|no-${disliked}`;
  }
}
