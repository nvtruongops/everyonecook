/**
 * AI Recipe Suggestion Handler
 *
 * Asynchronous handler for AI-powered recipe suggestions based on ingredients.
 * Implements Dictionary-first strategy with hybrid cache lookup before queuing AI processing.
 *
 * Flow:
 * 1. Normalize Vietnamese ingredients
 * 2. Lookup ingredients in Dictionary (Vietnamese → English)
 * 3. Check cache (exact match → partial match)
 * 4. If cache miss, queue AI job via SQS
 * 5. Return job ID for status tracking
 *
 * Performance Targets:
 * - Cache hit (exact): 50ms
 * - Cache hit (partial): 200ms
 * - Cache miss (queue): 100ms (async processing)
 *
 * Cost Optimization:
 * - Dictionary lookup: $0 (DynamoDB read)
 * - Cache hit: $0 (DynamoDB read)
 * - AI processing: $0.02 per request (async via SQS)
 *
 * @see .kiro/specs/project-restructure/ai-services-design.md - Recipe Generation section
 * @see .kiro/specs/project-restructure/requirements.md - Req 14-19 (AI Services)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { v4 as uuidv4 } from 'uuid';
import { SuggestionRequest, SuggestionResponse, CacheResult, AIJobMessage } from '../models';
import { AIRateLimitService } from '../../../shared/business-logic/rate-limiting/ai-rate-limit.service';

// Environment variables (REQUIRED - No fallbacks for production safety)
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const AI_QUEUE_URL = process.env.AI_QUEUE_URL;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID;
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

/**
 * CORS headers for all responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Correlation-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Validate required environment variables FIRST
if (!DYNAMODB_TABLE) {
  throw new Error('DYNAMODB_TABLE environment variable is required');
}
if (!AI_QUEUE_URL) {
  throw new Error('AI_QUEUE_URL environment variable is required');
}
if (!BEDROCK_MODEL_ID) {
  throw new Error('BEDROCK_MODEL_ID environment variable is required');
}

// Initialize AWS clients AFTER validation
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
});

// Initialize rate limiting service AFTER validation
const rateLimitService = new AIRateLimitService(DYNAMODB_TABLE);

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
 * Translation target structure
 */
interface Translation {
  specific: string;
  general: string;
  category: string;
}

/**
 * Lookup ingredient in Dictionary
 *
 * @param normalized - Normalized Vietnamese ingredient name
 * @returns Translation object or null if not found
 */
async function lookupDictionary(normalized: string): Promise<Translation | null> {
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
      return result.Item.target as Translation; // ✅ Return full Translation object
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
 * @returns Translation object or null if not found
 */
async function lookupTranslationCache(normalized: string): Promise<Translation | null> {
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
      // Check TTL not expired
      const now = Math.floor(Date.now() / 1000);
      if (result.Item.ttl && result.Item.ttl > now) {
        // Increment usage count (async, don't wait)
        incrementTranslationUsage(normalized).catch((err) =>
          logger('WARN', 'Failed to increment translation usage', { normalized, error: err })
        );

        return result.Item.target as Translation;
      }
    }

    return null;
  } catch (error) {
    logger('ERROR', 'Translation Cache lookup failed', { normalized, error });
    return null;
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
 * Translate ingredient using AI (Bedrock) - Professional version with validation
 *
 * Validates that ingredient is a REAL food ingredient before translating.
 * Returns null for invalid/fictional ingredients (e.g., "thịt khủng long").
 *
 * @param vietnamese - Vietnamese ingredient name (original with accents)
 * @returns English translation (lowercase-hyphenated) or null if invalid
 */
async function translateWithAI(vietnamese: string): Promise<string | null> {
  try {
    const prompt = `Bạn là chuyên gia dịch thuật ẩm thực Việt-Anh. Kiểm tra và dịch nguyên liệu sau.

Nguyên liệu: "${vietnamese}"

QUY TẮC:
1. KIỂM TRA: Nguyên liệu có THỰC SỰ tồn tại và ăn được không?
   - Nếu KHÔNG (vd: thịt khủng long, thịt rồng, thịt kỳ lân) → Trả về: INVALID
   - Nếu CÓ → Tiếp tục dịch

2. DỊCH: Trả về CHỈ tên tiếng Anh, KHÔNG giải thích
   - Dùng lowercase-hyphen (vd: pork-belly, beef-penis, chicken-gizzard)
   - Dịch CHÍNH XÁC bộ phận động vật:
     + bím bò/ngẩu pín = beef-penis
     + lưỡi bò = beef-tongue
     + mề gà = chicken-gizzard
     + lòng heo = pork-intestine
     + tim heo = pork-heart
     + gan heo = pork-liver

Kết quả (CHỈ 1 từ/cụm từ hoặc "INVALID"):`;

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 50,
      temperature: 0.1, // Low temperature for consistent translations
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID!,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract English translation from response
    const translation = responseBody.content[0].text.trim().toLowerCase();

    // Check if ingredient is invalid (fictional/non-existent)
    if (translation === 'invalid' || translation.includes('invalid')) {
      logger('WARN', 'Invalid ingredient detected by AI', { vietnamese, translation });
      return null;
    }

    logger('INFO', 'AI translation completed', { vietnamese, translation });

    return translation;
  } catch (error) {
    logger('ERROR', 'AI translation failed', { vietnamese, error });
    throw new Error('Failed to translate ingredient with AI');
  }
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
      modelId: BEDROCK_MODEL_ID!,
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
 * Add new translation to Translation Cache (1 year TTL)
 * Format matches bootstrap-dictionary.py for consistency
 *
 * @param vietnamese - Original Vietnamese name (with accents)
 * @param normalized - Normalized Vietnamese name
 * @param english - English translation
 * @param nutrition - Nutrition data from AI
 * @returns Success status
 */
async function addToTranslationCache(
  vietnamese: string,
  normalized: string,
  english: string,
  nutrition: NutritionData
): Promise<{ success: boolean; reason?: string }> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
    const englishNormalized = english.toLowerCase().replace(/\s+/g, '-');
    const timestamp = Date.now();

    // Format matches bootstrap-dictionary.py
    const entry = {
      PK: 'TRANSLATION_CACHE',
      SK: `INGREDIENT#${normalized}`, // Vietnamese normalized for lookup
      source: vietnamese, // Original with accents
      sourceNormalized: normalized,
      englishNormalized: englishNormalized, // Keep English for reference
      target: {
        specific: englishNormalized,
        general: englishNormalized,
        category: 'other',
      },
      addedBy: 'AI',
      addedAt: timestamp,
      usageCount: 1,
      lastUsed: timestamp,
      ttl: ttl, // 1 year TTL
      // GSI5 for English lookup (ai-worker uses this)
      GSI5PK: englishNormalized, // English normalized (lowercase-hyphen)
      GSI5SK: 'TRANSLATION_CACHE', // Fixed value for GSI5 lookup
      // Nutrition data (format matches bootstrap)
      nutrition: {
        per100g: nutrition.per100g,
        dataSource: nutrition.dataSource,
      },
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
      english: englishNormalized,
      hasNutrition: !!nutrition,
      ttl,
    });

    return { success: true };
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      logger('WARN', 'Ingredient already exists in Translation Cache', {
        vietnamese,
        normalized,
        english,
      });
      return { success: false, reason: 'ALREADY_EXISTS' };
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
 * Translate missing ingredient with AI and add to Translation Cache
 *
 * Returns null for invalid/fictional ingredients (e.g., "thịt khủng long").
 * Only caches REAL food ingredients.
 *
 * @param vietnamese - Original Vietnamese ingredient name
 * @param normalized - Normalized Vietnamese name
 * @returns English translation or null if failed/invalid
 */
async function translateAndCacheIngredient(
  vietnamese: string,
  normalized: string
): Promise<string | null> {
  try {
    // 1. Translate using AI (returns null for invalid ingredients)
    const english = await translateWithAI(vietnamese);

    // 2. If invalid ingredient, skip caching
    if (!english) {
      logger('WARN', 'Skipping invalid ingredient - not caching', {
        vietnamese,
        normalized,
      });
      return null;
    }

    // 3. Get nutrition data from AI
    const nutrition = await getNutritionWithAI(english);

    // 4. Add to Translation Cache
    await addToTranslationCache(vietnamese, normalized, english, nutrition);

    return english.toLowerCase().replace(/\s+/g, '-');
  } catch (error) {
    logger('ERROR', 'Failed to translate and cache ingredient', {
      vietnamese,
      normalized,
      error,
    });
    return null;
  }
}

/**
 * Increment translation cache usage count
 * Auto-promotes to Dictionary when usageCount >= 100
 *
 * @param normalized - Normalized Vietnamese ingredient name
 */
async function incrementTranslationUsage(normalized: string): Promise<void> {
  try {
    // Update usage count and lastUsed timestamp
    const result = await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        },
        UpdateExpression: 'SET usageCount = usageCount + :inc, lastUsed = :now',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': Date.now(),
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) return;

    const newCount = result.Attributes.usageCount || 0;

    // Check if should promote to Dictionary
    if (newCount >= 100) {
      await promoteToDict(result.Attributes);
    }
  } catch (error) {
    logger('ERROR', 'Failed to increment translation usage', { normalized, error });
  }
}

/**
 * Promote Translation Cache entry to Dictionary
 *
 * @param entry - Translation Cache entry
 */
async function promoteToDict(entry: any): Promise<void> {
  try {
    // Add to Dictionary (NO TTL - permanent)
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
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
        },
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
    logger('ERROR', 'Failed to promote to Dictionary', { entry, error });
  }
}

/**
 * Generate cache key (SIMPLIFIED for maximum hit rate)
 *
 * Only includes 4 core fields:
 * - Sorted ingredients
 * - Servings (1-5)
 * - Meal type (none/breakfast/lunch/dinner/snack)
 * - Max time (15/30/45/60/90/120)
 *
 * @param englishIngredients - English ingredient names
 * @param settings - Recipe settings
 * @returns Cache key string
 */
function generateCacheKey(
  englishIngredients: string[],
  settings: Partial<SuggestionRequest>
): string {
  const sortedIngredients = englishIngredients.sort().join('|');
  const servings = settings.servings || 2;
  const mealType = settings.mealType || 'none';
  const maxTime = settings.maxCookingTime || 60;

  return `${sortedIngredients}|s${servings}|${mealType}|t${maxTime}`;
}

/**
 * Check cache for exact match
 *
 * Cache key format: "ingredient1|ingredient2|s2|none|t60"
 *
 * @param englishIngredients - English ingredient names
 * @param settings - Recipe settings
 * @returns Cache result or null if not found
 */
async function checkExactCache(
  englishIngredients: string[],
  settings: Partial<SuggestionRequest>
): Promise<CacheResult | null> {
  try {
    // Generate cache key
    const cacheKey = generateCacheKey(englishIngredients, settings);

    const result = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: `AI_CACHE#${cacheKey}`,
          SK: 'METADATA',
        },
      })
    );

    if (result.Item) {
      // Check if cache is still valid (TTL not expired)
      const now = Math.floor(Date.now() / 1000);
      if (result.Item.ttl && result.Item.ttl > now) {
        return result.Item as CacheResult;
      }
    }

    return null;
  } catch (error) {
    logger('ERROR', 'Exact cache check failed', { englishIngredients, error });
    return null;
  }
}

/**
 * Check cache for partial match using GSI4 with STRICT matching rules
 *
 * GSI4 allows querying by ingredient list for partial matches.
 * Returns recipes that contain ALL of the requested ingredients (subset matching).
 *
 * STRICT MATCHING RULES:
 * 1. mealType: User "none" matches any, specific must match exactly (NOT "none")
 * 2. servings: Must match EXACTLY (2 người ≠ 1 người)
 * 3. maxTime: User 45min matches cache 60min, but NOT reverse
 * 4. dislikedIngredients: Empty matches empty only, NOT cache with disliked
 * 5. preferredCookingMethods: Empty matches any, specific must be subset
 * 6. ingredients: User must be subset of cache
 *
 * @param englishIngredients - English ingredient names
 * @param settings - User settings for strict matching
 * @returns Cache result or null if not found
 */
async function checkPartialCache(
  englishIngredients: string[],
  settings: Partial<SuggestionRequest>
): Promise<CacheResult | null> {
  try {
    // Query GSI4 for each ingredient in parallel
    const ingredientQueries = englishIngredients.map((ingredient) =>
      docClient.send(
        new QueryCommand({
          TableName: DYNAMODB_TABLE,
          IndexName: 'GSI4',
          KeyConditionExpression: 'GSI4PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `CACHE_INGREDIENT#${ingredient}`,
          },
          ProjectionExpression: 'GSI4SK, PK, SK',
        })
      )
    );

    const results = await Promise.all(ingredientQueries);

    // Extract cache IDs from each result
    const cacheIdSets = results.map((result) => {
      if (!result.Items || result.Items.length === 0) return new Set<string>();
      return new Set(result.Items.map((item) => item.PK as string));
    });

    // Find intersection (cache entries with ALL user ingredients)
    if (cacheIdSets.length === 0) return null;

    let intersection = cacheIdSets[0];
    for (let i = 1; i < cacheIdSets.length; i++) {
      intersection = new Set([...intersection].filter((id) => cacheIdSets[i].has(id)));
    }

    // No matches found
    if (intersection.size === 0) return null;

    // Get all matching cache entries and apply STRICT matching rules
    const userSettings = {
      servings: settings.servings || 2,
      mealType: (settings.mealType || 'none') as
        | 'none'
        | 'breakfast'
        | 'lunch'
        | 'dinner'
        | 'snack',
      maxTime: settings.maxCookingTime || 60,
      dislikedIngredients: settings.dislikedIngredients || [],
      preferredCookingMethods: (settings.preferredCookingMethods || []).filter((m) => m !== 'none'),
    };

    let bestMatch: CacheResult | null = null;
    let bestScore = -1;

    for (const cacheId of Array.from(intersection)) {
      const cacheResult = await docClient.send(
        new GetCommand({
          TableName: DYNAMODB_TABLE,
          Key: {
            PK: cacheId,
            SK: 'METADATA',
          },
        })
      );

      if (!cacheResult.Item) continue;

      // Check TTL
      const now = Math.floor(Date.now() / 1000);
      if (cacheResult.Item.ttl && cacheResult.Item.ttl <= now) continue;

      const cacheSettings = cacheResult.Item.settings || {};

      // STRICT MATCHING RULES:

      // 1. servings - MUST match exactly
      if (userSettings.servings !== (cacheSettings.servings || 2)) {
        logger('DEBUG', 'Cache rejected: servings mismatch', {
          cacheId,
          user: userSettings.servings,
          cache: cacheSettings.servings,
        });
        continue;
      }

      // 2. mealType - User "none" matches any, specific must match exactly (NOT "none")
      const cacheMealType = cacheSettings.mealType || 'none';
      if (userSettings.mealType !== 'none') {
        if (cacheMealType === 'none') {
          logger('DEBUG', 'Cache rejected: generic cache cannot satisfy specific meal', {
            cacheId,
            user: userSettings.mealType,
            cache: cacheMealType,
          });
          continue;
        }
        if (userSettings.mealType !== cacheMealType) {
          logger('DEBUG', 'Cache rejected: mealType mismatch', {
            cacheId,
            user: userSettings.mealType,
            cache: cacheMealType,
          });
          continue;
        }
      }

      // 3. maxTime - User 45min matches cache 60min, but NOT reverse
      const cacheMaxTime = cacheSettings.maxTime || 60;
      if (userSettings.maxTime > cacheMaxTime) {
        logger('DEBUG', 'Cache rejected: cache has less time than user needs', {
          cacheId,
          user: userSettings.maxTime,
          cache: cacheMaxTime,
        });
        continue;
      }

      // 4. dislikedIngredients - Empty matches empty only
      const cacheDisliked = cacheSettings.dislikedIngredients || [];
      if (userSettings.dislikedIngredients.length === 0) {
        if (cacheDisliked.length > 0) {
          logger('DEBUG', 'Cache rejected: user has no disliked but cache has', {
            cacheId,
            cacheDisliked,
          });
          continue;
        }
      } else {
        // User has disliked → cache must have ALL of user's disliked
        const missingDisliked = userSettings.dislikedIngredients.filter(
          (d) => !cacheDisliked.includes(d)
        );
        if (missingDisliked.length > 0) {
          logger('DEBUG', 'Cache rejected: cache missing disliked ingredients', {
            cacheId,
            missing: missingDisliked,
          });
          continue;
        }
      }

      // 5. preferredCookingMethods - Empty matches any, specific must be subset
      const cacheMethods = (cacheSettings.preferredCookingMethods || []).filter(
        (m: string) => m !== 'none'
      );
      if (userSettings.preferredCookingMethods.length > 0) {
        const missingMethods = userSettings.preferredCookingMethods.filter(
          (m) => !cacheMethods.includes(m)
        );
        if (missingMethods.length > 0) {
          logger('DEBUG', 'Cache rejected: cache missing cooking methods', {
            cacheId,
            missing: missingMethods,
          });
          continue;
        }
      }

      // Calculate match score (higher is better)
      let score = 100;
      // Bonus for exact time match
      if (userSettings.maxTime === cacheMaxTime) score += 10;
      // Bonus for exact mealType match
      if (userSettings.mealType === cacheMealType) score += 10;
      // Bonus for exact methods match
      if (
        userSettings.preferredCookingMethods.length === cacheMethods.length &&
        userSettings.preferredCookingMethods.every((m) => cacheMethods.includes(m))
      ) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cacheResult.Item as CacheResult;
      }
    }

    if (bestMatch) {
      logger('INFO', 'Partial cache match found with strict rules', {
        cacheKey: bestMatch.cacheKey,
        score: bestScore,
      });
    }

    return bestMatch;
  } catch (error) {
    logger('ERROR', 'Partial cache check failed', { englishIngredients, error });
    return null;
  }
}

/**
 * Queue AI job for processing
 *
 * @param jobId - Unique job ID
 * @param englishIngredients - English ingredient names
 * @param cacheKey - Generated cache key
 * @param settings - Recipe settings (servings, difficulty, etc.)
 * @param userId - User ID from JWT token
 */
async function queueAIJob(
  jobId: string,
  englishIngredients: string[],
  cacheKey: string,
  settings: Partial<SuggestionRequest>,
  userId: string
): Promise<void> {
  if (!AI_QUEUE_URL) {
    throw new Error('AI_QUEUE_URL environment variable not set');
  }

  try {
    const message: AIJobMessage = {
      jobId,
      userId,
      ingredients: englishIngredients,
      cacheKey, // ✅ Include cache key for storage
      settings: {
        servings: settings.servings || 2,
        mealType: settings.mealType || 'none',
        maxTime: settings.maxCookingTime || 60,
        dislikedIngredients: settings.dislikedIngredients || [],
        skillLevel: settings.skillLevel || 'none',
        preferredCookingMethods: settings.preferredCookingMethods || ['none'],
      },
      timestamp: Date.now(),
    };

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: AI_QUEUE_URL,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          JobType: {
            DataType: 'String',
            StringValue: 'RECIPE_SUGGESTION',
          },
          UserId: {
            DataType: 'String',
            StringValue: userId,
          },
        },
      })
    );

    logger('INFO', 'AI job queued successfully', { jobId, userId, cacheKey });
  } catch (error) {
    logger('ERROR', 'Failed to queue AI job', { jobId, userId, error });
    throw error;
  }
}

/**
 * Create job status record in DynamoDB
 *
 * @param jobId - Unique job ID
 * @param userId - User ID from JWT token
 */
async function createJobStatus(jobId: string, userId: string): Promise<void> {
  try {
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + 86400; // 24 hours TTL

    // Create job status record with PENDING status
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          PK: `JOB#${jobId}`,
          SK: 'STATUS',
          userId,
          status: 'PENDING',
          message: 'Job is queued for processing',
          createdAt: now,
          updatedAt: now,
          ttl,
        },
      })
    );

    logger('INFO', 'Job status record created', { jobId, userId, status: 'PENDING' });
  } catch (error) {
    logger('ERROR', 'Failed to create job status', { jobId, userId, error });
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
        handler: 'suggestion',
        ...metadata,
      })
    );
  }
}

/**
 * Lambda handler for AI recipe suggestions
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const correlationId = event.headers['x-correlation-id'] || uuidv4();

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
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

    const request: SuggestionRequest = JSON.parse(event.body);

    // Split ingredients that contain separators (comma, "and", "và", etc.)
    // This handles cases like "Thịt gà, Hành lá, Tiêu" as single string
    const splitIngredients = (ingredients: string[]): string[] => {
      const result: string[] = [];
      for (const ing of ingredients) {
        // Split by common separators: comma, "and", "và", "&", semicolon
        const parts = ing.split(/[,;]|\s+and\s+|\s+và\s+|\s*&\s*/i);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed && trimmed.length > 0) {
            result.push(trimmed);
          }
        }
      }
      return result;
    };

    // Apply ingredient splitting
    if (request.ingredients && Array.isArray(request.ingredients)) {
      request.ingredients = splitIngredients(request.ingredients);
      logger('DEBUG', 'Ingredients after splitting', {
        correlationId,
        ingredients: request.ingredients,
      });
    }

    // Validate ingredients
    if (
      !request.ingredients ||
      !Array.isArray(request.ingredients) ||
      request.ingredients.length === 0
    ) {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify({
          error: {
            code: 'INVALID_INGREDIENTS',
            message: 'Ingredients array is required and must not be empty',
            correlationId,
          },
        }),
      };
    }

    // Extract user ID from JWT token (set by API Gateway authorizer)
    const userId = event.requestContext.authorizer?.claims?.sub || 'anonymous';

    logger('INFO', 'Processing recipe suggestion request', {
      correlationId,
      userId,
      ingredientsCount: request.ingredients.length,
    });

    // ✅ RATE LIMITING: Check if user has exceeded daily limit (5 requests/day)
    // This applies to ALL requests (cache hit or miss)
    const rateLimitCheck = await rateLimitService.checkLimit(userId);

    if (!rateLimitCheck.allowed) {
      logger('WARN', 'Rate limit exceeded', {
        correlationId,
        userId,
        currentCount: rateLimitCheck.currentCount,
        limit: rateLimitCheck.limit,
        resetAt: new Date(rateLimitCheck.resetAt).toISOString(),
      });

      return {
        statusCode: 429, // Too Many Requests
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Retry-After': String(Math.ceil((rateLimitCheck.resetAt - Date.now()) / 1000)), // Seconds until reset
          'X-RateLimit-Limit': String(rateLimitCheck.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(rateLimitCheck.resetAt / 1000)), // Unix timestamp
        },
        body: JSON.stringify({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message:
              rateLimitCheck.message ||
              `Daily limit of ${rateLimitCheck.limit} AI suggestions exceeded`,
            limit: rateLimitCheck.limit,
            currentCount: rateLimitCheck.currentCount,
            resetAt: rateLimitCheck.resetAt,
            resetAtISO: new Date(rateLimitCheck.resetAt).toISOString(),
            correlationId,
          },
        }),
      };
    }

    // Step 1: Normalize Vietnamese ingredients
    const normalizedIngredients = request.ingredients.map((ing) => normalizeVietnamese(ing));

    logger('DEBUG', 'Ingredients normalized', {
      correlationId,
      original: request.ingredients,
      normalized: normalizedIngredients,
    });

    // Step 2: Lookup ingredients in Dictionary + Translation Cache
    // For missing ingredients, translate with AI and add to Translation Cache
    const englishIngredients: string[] = [];
    const translatedFromAI: string[] = []; // Track newly translated ingredients
    const failedIngredients: string[] = []; // Track ingredients that failed translation

    for (let i = 0; i < normalizedIngredients.length; i++) {
      const normalized = normalizedIngredients[i];
      const original = request.ingredients[i];

      // Try Dictionary first (NO TTL, permanent)
      let translation = await lookupDictionary(normalized);

      // Try Translation Cache if not in Dictionary (1 year TTL)
      if (!translation) {
        translation = await lookupTranslationCache(normalized);
      }

      if (translation) {
        englishIngredients.push(translation.specific); // Use specific translation
      } else {
        // NEW: Translate with AI and add to Translation Cache
        logger('INFO', 'Translating new ingredient with AI', {
          correlationId,
          vietnamese: original,
          normalized,
        });

        const englishTranslation = await translateAndCacheIngredient(original, normalized);

        if (englishTranslation) {
          englishIngredients.push(englishTranslation);
          translatedFromAI.push(original);
        } else {
          failedIngredients.push(original);
        }
      }
    }

    // If no ingredients could be translated, return error
    if (englishIngredients.length === 0) {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify({
          error: {
            code: 'NO_TRANSLATIONS',
            message: 'None of the ingredients could be translated. Please check ingredient names.',
            failedIngredients,
            correlationId,
          },
        }),
      };
    }

    logger('INFO', 'Ingredients translated', {
      correlationId,
      translatedCount: englishIngredients.length,
      totalCount: request.ingredients.length,
      fromDictionary: englishIngredients.length - translatedFromAI.length,
      fromAI: translatedFromAI.length,
      failed: failedIngredients.length,
      translatedFromAI,
      failedIngredients,
    });

    // Step 3: Check cache (exact match)
    const exactCache = await checkExactCache(englishIngredients, request);
    if (exactCache) {
      // ✅ RATE LIMITING: Increment counter even for cache hits
      const rateLimitUpdate = await rateLimitService.incrementCount(userId);

      const duration = Date.now() - startTime;

      logger('INFO', 'Cache hit (exact)', {
        correlationId,
        cacheKey: exactCache.cacheKey,
        duration,
        rateLimitCount: rateLimitUpdate.currentCount,
        rateLimitRemaining: rateLimitUpdate.limit - rateLimitUpdate.currentCount,
      });

      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'public, max-age=300', // 5 minutes
          'X-RateLimit-Limit': String(rateLimitUpdate.limit),
          'X-RateLimit-Remaining': String(
            Math.max(0, rateLimitUpdate.limit - rateLimitUpdate.currentCount)
          ),
          'X-RateLimit-Reset': String(Math.floor(rateLimitUpdate.resetAt / 1000)),
        },
        body: JSON.stringify({
          jobId: uuidv4(), // Generate job ID for consistency
          status: 'COMPLETED',
          message: 'Recipe suggestions retrieved from cache',
          cacheHit: true,
          recipes: exactCache.recipes,
          duration,
          rateLimit: {
            limit: rateLimitUpdate.limit,
            remaining: Math.max(0, rateLimitUpdate.limit - rateLimitUpdate.currentCount),
            resetAt: rateLimitUpdate.resetAt,
          },
        } as SuggestionResponse),
      };
    }

    // Step 4: Check cache (partial match) with STRICT matching rules
    const partialCache = await checkPartialCache(englishIngredients, request);
    if (partialCache) {
      // ✅ RATE LIMITING: Increment counter even for cache hits
      const rateLimitUpdate = await rateLimitService.incrementCount(userId);

      const duration = Date.now() - startTime;

      logger('INFO', 'Cache hit (partial)', {
        correlationId,
        cacheKey: partialCache.cacheKey,
        duration,
        rateLimitCount: rateLimitUpdate.currentCount,
        rateLimitRemaining: rateLimitUpdate.limit - rateLimitUpdate.currentCount,
      });

      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'public, max-age=300', // 5 minutes
          'X-RateLimit-Limit': String(rateLimitUpdate.limit),
          'X-RateLimit-Remaining': String(
            Math.max(0, rateLimitUpdate.limit - rateLimitUpdate.currentCount)
          ),
          'X-RateLimit-Reset': String(Math.floor(rateLimitUpdate.resetAt / 1000)),
        },
        body: JSON.stringify({
          jobId: uuidv4(), // Generate job ID for consistency
          status: 'COMPLETED',
          message: 'Recipe suggestions retrieved from cache (partial match)',
          cacheHit: true,
          recipes: partialCache.recipes,
          duration,
          rateLimit: {
            limit: rateLimitUpdate.limit,
            remaining: Math.max(0, rateLimitUpdate.limit - rateLimitUpdate.currentCount),
            resetAt: rateLimitUpdate.resetAt,
          },
        } as SuggestionResponse),
      };
    }

    // Step 5: Cache miss - Queue AI job
    // ✅ RATE LIMITING: Increment counter for cache miss
    const rateLimitUpdate = await rateLimitService.incrementCount(userId);

    const jobId = uuidv4();
    const cacheKey = generateCacheKey(englishIngredients, request);

    // Create job status record
    await createJobStatus(jobId, userId);

    // Queue AI job for processing
    await queueAIJob(jobId, englishIngredients, cacheKey, request, userId);

    const duration = Date.now() - startTime;

    logger('INFO', 'AI job queued (cache miss)', {
      correlationId,
      jobId,
      userId,
      duration,
      rateLimitCount: rateLimitUpdate.currentCount,
      rateLimitRemaining: rateLimitUpdate.limit - rateLimitUpdate.currentCount,
    });

    // Step 6: Return job ID for status tracking
    return {
      statusCode: 202, // Accepted (async processing)
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'X-RateLimit-Limit': String(rateLimitUpdate.limit),
        'X-RateLimit-Remaining': String(
          Math.max(0, rateLimitUpdate.limit - rateLimitUpdate.currentCount)
        ),
        'X-RateLimit-Reset': String(Math.floor(rateLimitUpdate.resetAt / 1000)),
      },
      body: JSON.stringify({
        jobId,
        status: 'PENDING',
        message: 'Recipe suggestion job queued for processing',
        estimatedTime: 30, // 30 seconds estimated processing time
        cacheHit: false,
        duration,
        rateLimit: {
          limit: rateLimitUpdate.limit,
          remaining: Math.max(0, rateLimitUpdate.limit - rateLimitUpdate.currentCount),
          resetAt: rateLimitUpdate.resetAt,
        },
      } as SuggestionResponse),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log full error details for debugging
    logger('ERROR', 'Recipe suggestion handler failed', {
      correlationId,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      duration,
    });

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process recipe suggestion request',
          // Include error details in dev/staging for debugging
          ...(LOG_LEVEL === 'DEBUG' &&
            error instanceof Error && {
              details: error.message,
            }),
          correlationId,
        },
      }),
    };
  }
}
