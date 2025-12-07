/**
 * Ingredient Lookup Handler
 *
 * Translates Vietnamese ingredients to English with auto-learning mechanism.
 * Implements 3-tier lookup strategy: Dictionary → Translation Cache → AI
 *
 * Flow:
 * 1. Normalize Vietnamese ingredient name
 * 2. Lookup in Dictionary (PK=DICTIONARY, SK=INGREDIENT#{normalized}) - Permanent storage
 * 3. If not found, lookup in Translation Cache (PK=TRANSLATION_CACHE, 1 year TTL)
 * 4. If found in Translation Cache, increment usageCount and check for promotion (>= 100)
 * 5. If not found in either, use AI translation service as fallback
 * 6. Auto-add new translation to Translation Cache (1 year TTL, 4-layer duplicate prevention)
 * 7. Return translation result
 *
 * Translation Cache Strategy:
 * - New ingredients → Translation Cache (1 year TTL, usageCount=1)
 * - Popular ingredients (usageCount >= 100) → Auto-promote to Dictionary (NO TTL, permanent)
 * - Rare ingredients (usageCount < 100 after 1 year) → TTL expires, auto-deleted
 * - Prevents spam Dictionary with invalid/rare ingredients
 *
 * Performance Targets:
 * - Dictionary hit: <50ms
 * - Translation Cache hit: <50ms
 * - AI fallback: 2-3s (first time only)
 * - Subsequent lookups: <50ms (from cache)
 *
 * Cost Optimization:
 * - Dictionary lookup: $0 (DynamoDB read)
 * - Translation Cache lookup: $0 (DynamoDB read)
 * - AI translation: $0.01 per new ingredient (one-time cost)
 * - After 12 months: 99% coverage → <$2/month AI costs
 *
 * @see .kiro/specs/project-restructure/ai-services-design.md - Translation Cache section
 * @see .kiro/specs/project-restructure/ai-services-flows.md - Use Case 5: Ingredient Translation
 * @see .kiro/specs/project-restructure/database-architecture.md - Translation Cache Strategy
 * @see .kiro/specs/project-restructure/requirements.md - Req 14-19 (AI Services)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { v4 as uuidv4 } from 'uuid';
import { DictionaryEntry, DictionaryLookupResult, IngredientCategory } from '../models';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

// Environment variables
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'EveryoneCook';
// Claude 3 Haiku - fast and cost-effective for ingredient lookup
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

/**
 * Normalize Vietnamese text for Dictionary lookup
 *
 * Normalization rules:
 * - Convert to lowercase
 * - Remove Vietnamese accents (à → a, ô → o, etc.)
 * - Replace spaces with hyphens
 * - Remove special characters
 *
 * Examples:
 * - "Thịt Ba Chỉ" → "thit-ba-chi"
 * - "Cà Chua" → "ca-chua"
 * - "Hành Tây" → "hanh-tay"
 *
 * @param text - Vietnamese text to normalize
 * @returns Normalized text for Dictionary lookup
 */
function normalizeVietnamese(text: string): string {
  // Convert to lowercase
  let normalized = text.toLowerCase();

  // Remove Vietnamese accents
  const accents: Record<string, string> = {
    à: 'a',
    á: 'a',
    ả: 'a',
    ã: 'a',
    ạ: 'a',
    ă: 'a',
    ằ: 'a',
    ắ: 'a',
    ẳ: 'a',
    ẵ: 'a',
    ặ: 'a',
    â: 'a',
    ầ: 'a',
    ấ: 'a',
    ẩ: 'a',
    ẫ: 'a',
    ậ: 'a',
    đ: 'd',
    è: 'e',
    é: 'e',
    ẻ: 'e',
    ẽ: 'e',
    ẹ: 'e',
    ê: 'e',
    ề: 'e',
    ế: 'e',
    ể: 'e',
    ễ: 'e',
    ệ: 'e',
    ì: 'i',
    í: 'i',
    ỉ: 'i',
    ĩ: 'i',
    ị: 'i',
    ò: 'o',
    ó: 'o',
    ỏ: 'o',
    õ: 'o',
    ọ: 'o',
    ô: 'o',
    ồ: 'o',
    ố: 'o',
    ổ: 'o',
    ỗ: 'o',
    ộ: 'o',
    ơ: 'o',
    ờ: 'o',
    ớ: 'o',
    ở: 'o',
    ỡ: 'o',
    ợ: 'o',
    ù: 'u',
    ú: 'u',
    ủ: 'u',
    ũ: 'u',
    ụ: 'u',
    ư: 'u',
    ừ: 'u',
    ứ: 'u',
    ử: 'u',
    ữ: 'u',
    ự: 'u',
    ỳ: 'y',
    ý: 'y',
    ỷ: 'y',
    ỹ: 'y',
    ỵ: 'y',
  };

  for (const [accented, plain] of Object.entries(accents)) {
    normalized = normalized.replace(new RegExp(accented, 'g'), plain);
  }

  // Replace spaces with hyphens
  normalized = normalized.replace(/\s+/g, '-');

  // Remove special characters (keep only alphanumeric and hyphens)
  normalized = normalized.replace(/[^a-z0-9-]/g, '');

  // Remove consecutive hyphens
  normalized = normalized.replace(/-+/g, '-');

  // Remove leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized;
}

/**
 * Lookup ingredient in Dictionary
 *
 * @param normalized - Normalized Vietnamese ingredient name
 * @returns Dictionary entry or null if not found
 */
async function lookupDictionary(normalized: string): Promise<DictionaryEntry | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: 'DICTIONARY',
          SK: `INGREDIENT#${normalized}`,
        },
      })
    );

    if (result.Item) {
      return result.Item as DictionaryEntry;
    }

    return null;
  } catch (error) {
    logger('ERROR', 'Dictionary lookup failed', { normalized, error });
    return null;
  }
}

/**
 * Lookup ingredient in Translation Cache (1 year TTL)
 *
 * @param normalized - Normalized Vietnamese ingredient name
 * @returns Translation Cache entry or null if not found
 */
async function lookupTranslationCache(normalized: string): Promise<any | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        },
      })
    );

    if (result.Item) {
      return result.Item;
    }

    return null;
  } catch (error) {
    logger('ERROR', 'Translation Cache lookup failed', { normalized, error });
    return null;
  }
}

// 13 allowed categories (from architecture standards)
const ALLOWED_CATEGORIES: IngredientCategory[] = [
  'meat',
  'eggs',
  'seafood',
  'vegetables',
  'condiments',
  'oils',
  'grains',
  'fruits',
  'dairy',
  'herbs',
  'legumes',
  'nuts',
  'aromatics',
];

interface AITranslationResult {
  english: string;
  category: IngredientCategory;
  specific: string;
  general: string;
}

/**
 * Validate if input is a real food ingredient
 *
 * @param vietnamese - Vietnamese input to validate
 * @returns true if valid food ingredient
 */
function isValidFoodInput(vietnamese: string): boolean {
  const normalized = vietnamese.toLowerCase().trim();

  // Invalid patterns
  const invalidPatterns = [
    /^[a-z]{1,3}$/, // Too short (abc, hi, etc.)
    /^(hehe|hihi|haha|test|abc|xxx|null|undefined|n\/a)$/i,
    /^\d+$/, // Only numbers
    /^[^a-zA-ZÀ-ỹ]+$/, // No letters at all
    /(.)\1{3,}/, // Repeated characters (aaaa, hhhh)
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Must have at least 2 characters
  if (normalized.length < 2) {
    return false;
  }

  return true;
}

/**
 * Map invalid category to closest valid category
 *
 * @param invalidCategory - Category returned by AI that's not in allowed list
 * @returns Valid category from 13 allowed categories
 */
function mapToValidCategory(invalidCategory: string): IngredientCategory {
  const mapping: Record<string, IngredientCategory> = {
    ingredient: 'condiments',
    other: 'condiments',
    spice: 'condiments',
    spices: 'condiments',
    seasoning: 'condiments',
    seasonings: 'condiments',
    sauce: 'condiments',
    sauces: 'condiments',
    poultry: 'meat',
    beef: 'meat',
    pork: 'meat',
    chicken: 'meat',
    lamb: 'meat',
    fish: 'seafood',
    shellfish: 'seafood',
    shrimp: 'seafood',
    mushroom: 'vegetables',
    mushrooms: 'vegetables',
    fungi: 'vegetables',
    vegetable: 'vegetables',
    fruit: 'fruits',
    grain: 'grains',
    noodle: 'grains',
    noodles: 'grains',
    rice: 'grains',
    bread: 'grains',
    pasta: 'grains',
    herb: 'herbs',
    aromatic: 'aromatics',
    oil: 'oils',
    fat: 'oils',
    nut: 'nuts',
    seed: 'nuts',
    seeds: 'nuts',
    bean: 'legumes',
    beans: 'legumes',
    tofu: 'legumes',
    egg: 'eggs',
    milk: 'dairy',
    cheese: 'dairy',
    butter: 'dairy',
    cream: 'dairy',
    unknown: 'condiments',
  };

  const lower = invalidCategory.toLowerCase();
  return mapping[lower] || 'condiments';
}

/**
 * Translate ingredient using AI (Bedrock) - Professional version
 *
 * Returns structured translation with:
 * - English name (specific)
 * - General category name
 * - Category (one of 13 allowed)
 *
 * @param vietnamese - Vietnamese ingredient name (original with accents)
 * @returns Structured translation result
 */
async function translateWithAI(vietnamese: string): Promise<AITranslationResult> {
  // Validate input first
  if (!isValidFoodInput(vietnamese)) {
    logger('WARN', 'Invalid food input rejected', { vietnamese });
    throw new Error(`Invalid ingredient: "${vietnamese}" is not a valid food ingredient`);
  }

  try {
    const prompt = `Bạn là chuyên gia dịch thuật ẩm thực Việt-Anh với 20 năm kinh nghiệm, am hiểu sâu về:
- Ẩm thực Việt Nam truyền thống và hiện đại
- Các bộ phận động vật dùng trong nấu ăn (nội tạng, thịt đặc biệt)
- Nguyên liệu địa phương và tên gọi vùng miền

Dịch nguyên liệu Việt Nam sang tiếng Anh CHÍNH XÁC.

Nguyên liệu: "${vietnamese}"

⚠️ QUY TẮC QUAN TRỌNG:
1. Nếu KHÔNG PHẢI nguyên liệu thực phẩm (text ngẫu nhiên, tên người, vật không ăn được), trả về: {"error": "NOT_FOOD"}
2. Category PHẢI là 1 trong 13 giá trị: meat, eggs, seafood, vegetables, condiments, oils, grains, fruits, dairy, herbs, legumes, nuts, aromatics
3. "specific" = tên tiếng Anh CHÍNH XÁC (vd: "pork-belly", "beef-penis", "chicken-gizzard")
4. "general" = tên chung (vd: "pork", "beef", "chicken")
5. Dùng lowercase-hyphen (vd: "pork-belly", KHÔNG "Pork Belly")

📋 VÍ DỤ DỊCH CHÍNH XÁC:
- "thịt ba chỉ" → {"english": "pork-belly", "specific": "pork-belly", "general": "pork", "category": "meat"}
- "bím bò" / "ngẩu pín" → {"english": "beef-penis", "specific": "beef-penis", "general": "beef-offal", "category": "meat"}
- "lưỡi bò" → {"english": "beef-tongue", "specific": "beef-tongue", "general": "beef-offal", "category": "meat"}
- "mề gà" → {"english": "chicken-gizzard", "specific": "chicken-gizzard", "general": "chicken-offal", "category": "meat"}
- "lòng heo" → {"english": "pork-intestine", "specific": "pork-intestine", "general": "pork-offal", "category": "meat"}
- "tim heo" → {"english": "pork-heart", "specific": "pork-heart", "general": "pork-offal", "category": "meat"}
- "gan heo" → {"english": "pork-liver", "specific": "pork-liver", "general": "pork-offal", "category": "meat"}
- "thắng cố" → {"english": "horse-offal-stew-ingredients", "specific": "horse-offal-mix", "general": "offal", "category": "meat"}
- "hành lá" → {"english": "scallion", "specific": "scallion", "general": "onion", "category": "aromatics"}
- "nước mắm" → {"english": "fish-sauce", "specific": "fish-sauce", "general": "fish-sauce", "category": "condiments"}
- "đậu hũ" → {"english": "tofu", "specific": "tofu", "general": "soybean", "category": "legumes"}

Trả về CHỈ JSON object với format:
{"english": "specific-name", "specific": "specific-name", "general": "general-name", "category": "category"}`;

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 150,
      temperature: 0.1, // Low temperature for consistent translations
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const responseText = responseBody.content[0].text.trim();

    // Parse JSON response
    const parsed = JSON.parse(responseText);

    // Check if AI rejected as non-food
    if (parsed.error === 'NOT_FOOD') {
      logger('WARN', 'AI rejected input as non-food', { vietnamese });
      throw new Error(`Invalid ingredient: "${vietnamese}" is not a valid food ingredient`);
    }

    // Validate and fix category
    let category = parsed.category?.toLowerCase() as IngredientCategory;
    if (!ALLOWED_CATEGORIES.includes(category)) {
      logger('WARN', 'Invalid category from AI, mapping to valid category', {
        vietnamese,
        invalidCategory: parsed.category,
      });
      category = mapToValidCategory(parsed.category || 'unknown');
    }

    const result: AITranslationResult = {
      english: parsed.english?.toLowerCase().replace(/\s+/g, '-') || parsed.specific,
      specific: parsed.specific?.toLowerCase().replace(/\s+/g, '-') || parsed.english,
      general: parsed.general?.toLowerCase().replace(/\s+/g, '-') || parsed.specific,
      category,
    };

    logger('INFO', 'AI translation completed', {
      vietnamese,
      result,
    });

    return result;
  } catch (error) {
    // Re-throw validation errors
    if (error instanceof Error && error.message.includes('Invalid ingredient')) {
      throw error;
    }

    logger('ERROR', 'AI translation failed', { vietnamese, error });
    throw new Error('Failed to translate ingredient with AI');
  }
}

/**
 * Nutrition data structure
 */
interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface NutritionData {
  per100g: NutritionPer100g;
  dataSource: 'AI' | 'USDA';
}

/**
 * Get nutrition data for an ingredient using AI
 *
 * Uses Claude 3 Haiku to estimate nutrition per 100g based on USDA data
 *
 * @param ingredientEnglish - English ingredient name
 * @returns Nutrition data per 100g
 */
async function getNutritionWithAI(ingredientEnglish: string): Promise<NutritionData> {
  try {
    const prompt = `You are a nutrition expert. Provide estimated nutrition data per 100g for: "${ingredientEnglish}"

Return ONLY a JSON object with this exact format (no explanation):
{"calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>}

Use USDA database values as reference. All values should be numbers (not strings).`;

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 100,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const nutritionText = responseBody.content[0].text.trim();

    // Parse JSON response
    const nutrition = JSON.parse(nutritionText);

    logger('INFO', 'AI nutrition data retrieved', {
      ingredient: ingredientEnglish,
      nutrition,
    });

    return {
      per100g: {
        calories: Number(nutrition.calories) || 0,
        protein: Number(nutrition.protein) || 0,
        carbs: Number(nutrition.carbs) || 0,
        fat: Number(nutrition.fat) || 0,
        fiber: Number(nutrition.fiber) || 0,
      },
      dataSource: 'AI',
    };
  } catch (error) {
    logger('ERROR', 'AI nutrition lookup failed', { ingredient: ingredientEnglish, error });

    // Return default nutrition data on error
    return {
      per100g: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      },
      dataSource: 'AI',
    };
  }
}

/**
 * Increment usage count in Translation Cache and check for promotion
 *
 * @param normalized - Normalized Vietnamese ingredient name
 * @returns Updated entry with new usage count
 */
async function incrementUsageCount(normalized: string): Promise<any> {
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        },
        UpdateExpression: 'SET usageCount = usageCount + :inc, lastUsedAt = :now',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': Date.now(),
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    const updatedEntry = result.Attributes;

    // Check if should promote to Dictionary
    if (updatedEntry && updatedEntry.usageCount >= 100) {
      logger('INFO', 'Ingredient reached promotion threshold', {
        ingredient: updatedEntry.source,
        usageCount: updatedEntry.usageCount,
      });

      await promoteToDictionary(updatedEntry);
    }

    return updatedEntry;
  } catch (error) {
    logger('ERROR', 'Failed to increment usage count', { normalized, error });
    throw error;
  }
}

/**
 * Promote ingredient from Translation Cache to Dictionary
 * Format matches bootstrap-dictionary.py for consistency
 *
 * @param entry - Translation Cache entry to promote
 */
async function promoteToDictionary(entry: any): Promise<void> {
  try {
    // Add to Dictionary (NO TTL - permanent)
    // Preserve nutrition data from Translation Cache
    const timestamp = Date.now();
    const englishNormalized = entry.target?.specific || entry.englishNormalized || entry.target;

    const dictionaryItem: Record<string, any> = {
      PK: 'DICTIONARY',
      SK: entry.SK, // Vietnamese normalized (INGREDIENT#thit-ba-chi)
      source: entry.source, // Original Vietnamese with accents
      sourceNormalized: entry.sourceNormalized,
      englishNormalized: englishNormalized,
      target: entry.target?.specific
        ? entry.target
        : {
            specific: englishNormalized,
            general: englishNormalized,
            category: entry.target?.category || 'other',
          },
      addedBy: 'PROMOTED',
      addedAt: entry.addedAt || entry.createdAt,
      promotedAt: timestamp,
      usageCount: entry.usageCount,
      lastUsed: entry.lastUsed || entry.lastUsedAt,
      // GSI5 for English lookup (ai-worker uses this)
      GSI5PK: englishNormalized, // English normalized (lowercase-hyphen)
      GSI5SK: 'DICTIONARY', // Fixed value for GSI5 lookup
      // NO TTL - permanent
    };

    // Preserve nutrition data if exists (format matches bootstrap)
    if (entry.nutrition) {
      dictionaryItem.nutrition = entry.nutrition;
    }

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: dictionaryItem,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      })
    );

    // Delete from Translation Cache
    await docClient.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: 'TRANSLATION_CACHE',
          SK: entry.SK,
        },
      })
    );

    logger('INFO', 'Ingredient promoted to Dictionary', {
      ingredient: entry.source,
      usageCount: entry.usageCount,
    });
  } catch (error) {
    logger('ERROR', 'Failed to promote ingredient to Dictionary', {
      ingredient: entry.source,
      error,
    });
    throw error;
  }
}

/**
 * Add new translation to Translation Cache (1 year TTL) with 4-layer duplicate prevention
 *
 * 4-Layer Duplicate Prevention:
 * 1. Normalize Vietnamese (thịt ba chỉ → thit-ba-chi)
 * 2. Pre-insert check (Vietnamese in Dictionary + Translation Cache, English via GSI5)
 * 3. Conditional write (attribute_not_exists)
 * 4. Race condition handling (ConditionalCheckFailedException)
 *
 * @param vietnamese - Original Vietnamese name (with accents)
 * @param normalized - Normalized Vietnamese name
 * @param translation - Structured translation result from AI
 * @param nutrition - Optional nutrition data
 * @returns Success status
 */
async function addToTranslationCache(
  vietnamese: string,
  normalized: string,
  translation: AITranslationResult,
  nutrition?: NutritionData
): Promise<{ success: boolean; reason?: string; existing?: any }> {
  const english = translation.english;
  try {
    // Layer 2: Pre-insert check (Vietnamese in Dictionary)
    const dictionaryDup = await lookupDictionary(normalized);
    if (dictionaryDup) {
      logger('WARN', 'Ingredient already in Dictionary', {
        vietnamese,
        normalized,
        existing: dictionaryDup.target,
      });
      return {
        success: false,
        reason: 'ALREADY_IN_DICTIONARY',
        existing: dictionaryDup,
      };
    }

    // Layer 2: Pre-insert check (Vietnamese in Translation Cache)
    const cacheDup = await lookupTranslationCache(normalized);
    if (cacheDup) {
      logger('WARN', 'Ingredient already in Translation Cache', {
        vietnamese,
        normalized,
        existing: cacheDup.target,
      });
      return {
        success: false,
        reason: 'ALREADY_IN_CACHE',
        existing: cacheDup,
      };
    }

    // Layer 2: Pre-insert check (English via GSI5 - check both Dictionary and Translation Cache)
    const englishDup = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        IndexName: 'GSI5',
        KeyConditionExpression: 'GSI5PK = :english',
        ExpressionAttributeValues: {
          ':english': english,
        },
        Limit: 1,
      })
    );

    if (englishDup.Items && englishDup.Items.length > 0) {
      logger('WARN', 'Duplicate English ingredient detected (pre-insert)', {
        english,
        existing: englishDup.Items[0],
      });
      return {
        success: false,
        reason: 'DUPLICATE_ENGLISH',
        existing: englishDup.Items[0],
      };
    }

    // Layer 3: Conditional write (atomic)
    // Format matches bootstrap-dictionary.py for consistency
    const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
    const timestamp = Date.now();
    const englishNormalized = translation.specific.toLowerCase().replace(/\s+/g, '-');

    const entry: Record<string, any> = {
      PK: 'TRANSLATION_CACHE',
      SK: `INGREDIENT#${normalized}`, // Vietnamese normalized for lookup
      source: vietnamese, // Original with accents
      sourceNormalized: normalized,
      englishNormalized: englishNormalized, // Keep English for reference
      // Structured target with specific/general/category
      target: {
        specific: englishNormalized,
        general: translation.general.toLowerCase().replace(/\s+/g, '-'),
        category: translation.category,
      },
      addedBy: 'AI',
      addedAt: timestamp,
      usageCount: 1,
      lastUsed: timestamp,
      ttl: ttl, // 1 year TTL
      // GSI5 for English lookup (ai-worker uses this)
      GSI5PK: englishNormalized, // English normalized (lowercase-hyphen)
      GSI5SK: 'TRANSLATION_CACHE', // Fixed value for GSI5 lookup
    };

    // Add nutrition data (format matches bootstrap)
    // getNutritionWithAI always returns data (with fallback defaults)
    entry.nutrition = {
      per100g: nutrition?.per100g || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      dataSource: nutrition?.dataSource || 'AI',
    };

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: entry,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      })
    );

    logger('INFO', 'New ingredient added to Translation Cache', {
      vietnamese,
      normalized,
      english,
      ttl,
    });

    return { success: true };
  } catch (error: any) {
    // Layer 4: Race condition handling
    if (error.name === 'ConditionalCheckFailedException') {
      logger('WARN', 'Race condition detected during Translation Cache insert', {
        vietnamese,
        normalized,
        english,
      });

      // Fetch the existing entry
      const existing = await lookupTranslationCache(normalized);
      return {
        success: false,
        reason: 'RACE_CONDITION',
        existing: existing || undefined,
      };
    }

    logger('ERROR', 'Failed to add ingredient to Translation Cache', {
      vietnamese,
      normalized,
      english,
      error,
    });
    throw error;
  }
}

/**
 * Structured logger
 *
 * @param level - Log level (INFO, WARN, ERROR)
 * @param message - Log message
 * @param metadata - Additional metadata
 */
function logger(level: string, message: string, metadata?: Record<string, any>): void {
  if (LOG_LEVEL === 'DEBUG' || level !== 'DEBUG') {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        service: 'ai-module',
        handler: 'lookup',
        ...metadata,
      })
    );
  }
}

/**
 * Lambda handler for ingredient lookup
 *
 * Supports both:
 * - GET /dictionary/{ingredient} - Path parameter (URL encoded)
 * - POST /dictionary/lookup - Body with { ingredient: "..." }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const correlationId = event.headers['x-correlation-id'] || uuidv4();

  // Debug log to trace httpMethod issue
  logger('INFO', 'Lookup handler invoked', {
    correlationId,
    httpMethod: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters,
    hasBody: !!event.body,
  });

  try {
    let vietnamese: string;

    // Support both GET (path parameter) and POST (body)
    if (event.httpMethod === 'GET') {
      // GET /dictionary/{ingredient} - Extract from path parameter
      const pathIngredient =
        event.pathParameters?.ingredient || event.path?.split('/dictionary/')[1];

      if (!pathIngredient) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
          },
          body: JSON.stringify({
            error: {
              code: 'MISSING_INGREDIENT',
              message: 'Ingredient path parameter is required',
              correlationId,
            },
          }),
        };
      }

      // Decode URL-encoded ingredient (e.g., "Th%E1%BB%8Bt%20g%C3%A0" → "Thịt gà")
      vietnamese = decodeURIComponent(pathIngredient).trim();
    } else {
      // POST /dictionary/lookup - Extract from body
      if (!event.body) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
          },
          body: JSON.stringify({
            error: {
              code: 'MISSING_BODY',
              message: 'Request body is required',
              correlationId,
            },
          }),
        };
      }

      const request = JSON.parse(event.body);

      // Validate ingredient
      if (!request.ingredient || typeof request.ingredient !== 'string') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
          },
          body: JSON.stringify({
            error: {
              code: 'INVALID_INGREDIENT',
              message: 'Ingredient name is required and must be a string',
              correlationId,
            },
          }),
        };
      }

      vietnamese = request.ingredient.trim();
    }

    logger('INFO', 'Processing ingredient lookup request', {
      correlationId,
      vietnamese,
    });

    // Step 1: Normalize Vietnamese ingredient
    const normalized = normalizeVietnamese(vietnamese);

    logger('DEBUG', 'Ingredient normalized', {
      correlationId,
      original: vietnamese,
      normalized,
    });

    // Step 2: Lookup in Dictionary (permanent storage)
    const dictionaryEntry = await lookupDictionary(normalized);

    if (dictionaryEntry) {
      const duration = Date.now() - startTime;

      logger('INFO', 'Dictionary hit', {
        correlationId,
        vietnamese,
        english: dictionaryEntry.target,
        duration,
      });

      const result: DictionaryLookupResult = {
        found: true,
        translation: dictionaryEntry.target,
        vietnamese,
        normalized,
        category: dictionaryEntry.category,
        alternatives: dictionaryEntry.alternatives,
      };

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'public, max-age=86400', // 24 hours
        },
        body: JSON.stringify(result),
      };
    }

    // Step 3: Lookup in Translation Cache (1 year TTL - evaluation period)
    const cacheEntry = await lookupTranslationCache(normalized);

    if (cacheEntry) {
      // Increment usage count and check for promotion
      await incrementUsageCount(normalized);

      const duration = Date.now() - startTime;

      logger('INFO', 'Translation Cache hit', {
        correlationId,
        vietnamese,
        english: cacheEntry.target,
        usageCount: cacheEntry.usageCount + 1,
        duration,
      });

      const result: DictionaryLookupResult = {
        found: true,
        translation: cacheEntry.target,
        vietnamese,
        normalized,
      };

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'public, max-age=86400', // 24 hours
        },
        body: JSON.stringify(result),
      };
    }

    // Step 4: Cache miss - Use AI translation
    logger('INFO', 'Cache miss - using AI translation', {
      correlationId,
      vietnamese,
      normalized,
    });

    let translation: AITranslationResult;
    try {
      translation = await translateWithAI(vietnamese);
    } catch (error) {
      // Handle invalid ingredient (non-food input)
      if (error instanceof Error && error.message.includes('Invalid ingredient')) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
          },
          body: JSON.stringify({
            error: {
              code: 'INVALID_INGREDIENT',
              message: error.message,
              correlationId,
            },
          }),
        };
      }
      throw error;
    }

    // Step 4.5: Get nutrition data from AI
    logger('INFO', 'Getting nutrition data from AI', {
      correlationId,
      ingredient: translation.english,
    });

    const nutrition = await getNutritionWithAI(translation.english);

    // Step 5: Auto-add to Translation Cache (1 year TTL, 4-layer duplicate prevention)
    // Include nutrition data for future recipe calculations
    const addResult = await addToTranslationCache(vietnamese, normalized, translation, nutrition);

    if (!addResult.success) {
      logger('WARN', 'Failed to add to Translation Cache (duplicate detected)', {
        correlationId,
        vietnamese,
        english: translation.english,
        reason: addResult.reason,
      });

      // Return existing translation if duplicate
      if (addResult.existing) {
        const result: DictionaryLookupResult = {
          found: true,
          translation: addResult.existing.target,
          vietnamese,
          normalized,
          category: addResult.existing.category,
          alternatives: addResult.existing.alternatives,
        };

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            'Cache-Control': 'public, max-age=86400', // 24 hours
          },
          body: JSON.stringify(result),
        };
      }
    }

    const duration = Date.now() - startTime;

    logger('INFO', 'AI translation completed and added to Translation Cache', {
      correlationId,
      vietnamese,
      translation,
      duration,
    });

    // Step 6: Return translation result with structured data
    const result: DictionaryLookupResult = {
      found: true,
      translation: translation.specific,
      vietnamese,
      normalized,
      category: translation.category,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'Cache-Control': 'public, max-age=86400', // 24 hours
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger('ERROR', 'Ingredient lookup handler failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process ingredient lookup request',
          correlationId,
        },
      }),
    };
  }
}
