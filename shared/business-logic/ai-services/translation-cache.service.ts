/**
 * Translation Cache Service - 1 Year TTL
 *
 * Purpose: Temporary storage for AI-translated ingredients
 * Storage: DynamoDB with 1-year TTL
 * Lifecycle: Cache → Promote to Dictionary when usageCount >= 100
 *
 * Performance: 10-20ms
 * Priority: HIGH - Cost optimization
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface Translation {
  specific: string;
  general: string;
  category: string;
}

export interface TranslationCacheEntry {
  PK: 'TRANSLATION_CACHE';
  SK: string; // "INGREDIENT#{normalized}"
  source: string; // Original Vietnamese with accents
  target: Translation;
  nutrition: {
    per100g: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
    dataSource: 'USDA' | 'AI';
  };
  addedBy: 'AI';
  addedAt: number;
  confidence: number;
  usageCount: number;
  lastUsed: number;
  ttl: number; // 1 year (31,536,000 seconds)

  // GSI5 for reverse lookup
  GSI5PK: string; // English name
  GSI5SK: 'TRANSLATION_CACHE';
}

export class TranslationCacheService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;
  private readonly PROMOTION_THRESHOLD = 100;
  private readonly TTL_DURATION = 31536000; // 1 year in seconds

  constructor(tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook') {
    this.dynamoClient = new DynamoDBClient({});
    this.tableName = tableName;
  }

  /**
   * Get translation from cache
   *
   * @param normalized - Normalized Vietnamese ingredient
   * @returns Cache entry or null
   *
   * Performance: 10-20ms
   */
  async get(normalized: string): Promise<TranslationCacheEntry | null> {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as TranslationCacheEntry;
  }

  /**
   * Store AI translation result
   *
   * @param entry - Translation cache entry
   *
   * Performance: 20-30ms
   */
  async store(
    entry: Omit<TranslationCacheEntry, 'PK' | 'SK' | 'ttl' | 'usageCount' | 'lastUsed'>
  ): Promise<void> {
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + this.TTL_DURATION;

    const cacheEntry: TranslationCacheEntry = {
      PK: 'TRANSLATION_CACHE',
      SK: `INGREDIENT#${this.normalize(entry.source)}`,
      ...entry,
      usageCount: 1,
      lastUsed: now,
      ttl,
    };

    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(cacheEntry),
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      })
    );
  }

  /**
   * Increment usage count
   *
   * Auto-promotes to Dictionary when usageCount >= 100
   *
   * @param normalized - Normalized Vietnamese ingredient
   * @returns New usage count
   *
   * Performance: 20-30ms
   */
  async incrementUsage(normalized: string): Promise<number> {
    const result = await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        }),
        UpdateExpression: 'SET usageCount = usageCount + :inc, lastUsed = :now',
        ExpressionAttributeValues: marshall({
          ':inc': 1,
          ':now': Date.now(),
        }),
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) {
      return 0;
    }

    const entry = unmarshall(result.Attributes) as TranslationCacheEntry;
    const newCount = entry.usageCount;

    // Check if should promote to Dictionary
    if (newCount >= this.PROMOTION_THRESHOLD) {
      await this.promoteToDict(entry);
    }

    return newCount;
  }

  /**
   * Promote to Dictionary (usageCount >= 100)
   *
   * Steps:
   * 1. Add to Dictionary (NO TTL - permanent)
   * 2. Delete from Translation Cache
   *
   * @param entry - Translation cache entry
   *
   * Performance: 40-50ms
   */
  async promoteToDict(entry: TranslationCacheEntry): Promise<void> {
    // Add to Dictionary
    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          PK: 'DICTIONARY',
          SK: entry.SK,
          source: entry.source,
          target: entry.target,
          nutrition: entry.nutrition,
          addedBy: 'PROMOTED',
          addedAt: entry.addedAt,
          promotedAt: Date.now(),
          confidence: entry.confidence,
          usageCount: entry.usageCount,
          // NO TTL - permanent
          GSI5PK: entry.target.specific,
          GSI5SK: 'DICTIONARY',
        }),
      })
    );

    // Delete from Translation Cache
    await this.dynamoClient.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: 'TRANSLATION_CACHE',
          SK: entry.SK,
        }),
      })
    );

    console.log('Ingredient promoted to Dictionary', {
      ingredient: entry.source,
      usageCount: entry.usageCount,
      normalized: entry.SK,
    });
  }

  /**
   * Normalize Vietnamese text
   *
   * @param text - Vietnamese text with accents
   * @returns Normalized text
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
