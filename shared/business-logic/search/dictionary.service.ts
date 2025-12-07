/**
 * Dictionary Service - Ingredient Normalization
 *
 * Purpose: Vietnamese ↔ English ingredient translation
 * Storage: DynamoDB Dictionary table (NO TTL - permanent)
 * Access Patterns:
 * - Primary: PK=DICTIONARY, SK=INGREDIENT#{normalized}
 * - GSI5: Reverse lookup (English → Vietnamese)
 *
 * Performance: 10-20ms
 * Priority: HIGH - Blocking for AI services
 */

import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface Translation {
  specific: string; // "pork-belly"
  general: string; // "pork"
  category: string; // "meat"
}

export interface DictionaryEntry {
  PK: 'DICTIONARY';
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
  addedBy: 'BOOTSTRAP' | 'AI' | 'ADMIN' | 'PROMOTED';
  addedAt: number;
  usageCount: number;
  confidence?: number;

  // GSI5 for reverse lookup
  GSI5PK: string; // English name
  GSI5SK: 'DICTIONARY';
}

export class DictionaryService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook') {
    this.dynamoClient = new DynamoDBClient({});
    this.tableName = tableName;
  }

  /**
   * Direct lookup: Vietnamese → English
   *
   * @param vietnamese - Vietnamese ingredient name (will be normalized)
   * @returns Translation or null if not found
   *
   * Performance: 10-20ms
   */
  async lookup(vietnamese: string): Promise<Translation | null> {
    const normalized = this.normalize(vietnamese);

    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: 'DICTIONARY',
          SK: `INGREDIENT#${normalized}`,
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    const entry = unmarshall(result.Item) as DictionaryEntry;
    return entry.target;
  }

  /**
   * Reverse lookup: English → Vietnamese (GSI5)
   *
   * @param english - English ingredient name
   * @returns Array of dictionary entries
   *
   * Performance: 10-20ms
   */
  async reverseLookup(english: string): Promise<DictionaryEntry[]> {
    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI5',
        KeyConditionExpression: 'GSI5PK = :english AND GSI5SK = :dict',
        ExpressionAttributeValues: marshall({
          ':english': english,
          ':dict': 'DICTIONARY',
        }),
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => unmarshall(item) as DictionaryEntry);
  }

  /**
   * Batch lookup for multiple ingredients
   *
   * @param ingredients - Array of Vietnamese ingredient names
   * @returns Map of normalized name → Translation
   *
   * Performance: 50-100ms for 10 ingredients
   */
  async batchLookup(ingredients: string[]): Promise<Map<string, Translation>> {
    const results = new Map<string, Translation>();

    // Lookup in parallel
    const lookups = await Promise.all(
      ingredients.map(async (ing) => {
        const normalized = this.normalize(ing);
        const translation = await this.lookup(ing);
        return { normalized, translation };
      })
    );

    // Build map
    lookups.forEach(({ normalized, translation }) => {
      if (translation) {
        results.set(normalized, translation);
      }
    });

    return results;
  }

  /**
   * Add new dictionary entry with 4-layer duplicate prevention
   *
   * Layer 1: Normalized Primary Key (PK + SK)
   * Layer 2: Pre-insert check (Vietnamese + English)
   * Layer 3: Conditional write (atomic)
   * Layer 4: Race condition handling
   *
   * @param entry - Dictionary entry to add
   * @returns Existing entry if duplicate, void if success
   * @throws Error if validation fails
   */
  async addEntry(entry: DictionaryEntry): Promise<DictionaryEntry | void> {
    // Layer 1: Normalize Vietnamese (already in SK)
    const normalized = this.normalize(entry.source);
    const sk = `INGREDIENT#${normalized}`;

    // Layer 2a: Pre-insert check - Vietnamese duplicate
    const vietnameseDup = await this.lookup(entry.source);
    if (vietnameseDup) {
      console.warn('Vietnamese duplicate detected:', {
        source: entry.source,
        normalized,
        existing: vietnameseDup,
      });
      throw new Error(`Vietnamese duplicate: "${entry.source}" already exists`);
    }

    // Layer 2b: Pre-insert check - English duplicate via GSI5
    const englishDup = await this.reverseLookup(entry.target.specific);
    if (englishDup.length > 0) {
      console.warn('English duplicate detected:', {
        english: entry.target.specific,
        existing: englishDup,
      });
      throw new Error(`English duplicate: "${entry.target.specific}" already exists`);
    }

    // Layer 3: Conditional write (atomic)
    try {
      await this.dynamoClient.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall({
            ...entry,
            SK: sk, // Ensure normalized SK
          }),
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );

      console.log('✅ Dictionary entry added:', {
        source: entry.source,
        normalized,
        target: entry.target.specific,
      });
    } catch (error: any) {
      // Layer 4: Race condition handling
      if (error.name === 'ConditionalCheckFailedException') {
        console.warn('Race condition detected, fetching existing entry:', {
          source: entry.source,
          normalized,
        });

        // Fetch existing entry
        const existing = await this.lookup(entry.source);
        if (existing) {
          console.log('Using existing entry from race condition:', existing);
          return existing as any; // Return existing entry
        }
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Normalize Vietnamese text for consistent lookup
   *
   * @param text - Vietnamese text with accents
   * @returns Normalized text (lowercase, no accents, hyphens)
   *
   * Example: "Thịt Ba Chỉ" → "thit-ba-chi"
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/\s+/g, '-') // Spaces → hyphens
      .replace(/[^a-z0-9-]/g, '') // Remove special chars
      .replace(/-+/g, '-') // Multiple hyphens → single
      .replace(/^-|-$/g, ''); // Trim hyphens
  }
}
