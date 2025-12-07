/**
 * Recipe Management Handler
 *
 * Implements CRUD operations for recipe management and Recipe Picker API for Social Module.
 *
 * Features:
 * - Create recipe (manual or AI-generated)
 * - Get recipe details by ID
 * - Update recipe metadata
 * - Delete recipe and S3 images
 * - Get user recipes (Recipe Picker API)
 * - Recipe sharing integration with Social Module
 *
 * Recipe Picker API:
 * - GET /recipes → Returns user's recipes (summary format)
 * - GET /recipes/{recipeId} → Returns full recipe details
 * - Supports filters: search, difficulty, isShared
 * - Optimized projection for performance
 *
 * Important Notes:
 * - Ingredients are ALREADY TRANSLATED by lookup.handler (task 5.5.4)
 * - Recipe handlers only CRUD recipes, NOT translate ingredients
 * - Translation flow: User input → lookup.handler → Frontend stores both Vietnamese + English
 *
 * @see .kiro/specs/project-restructure/ai-services-design.md - Recipe Management
 * @see .kiro/specs/project-restructure/social-requirements.md - Requirement 1 (Recipe Picker)
 * @see .kiro/specs/project-restructure/social-design.md - Type 3: Recipe Share from Feed
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { v4 as uuidv4 } from 'uuid';
import {
  RecipeEntity,
  RecipeSummary,
  RecipeDetails,
  CreateRecipeRequest,
  UpdateRecipeRequest,
  GetUserRecipesRequest,
  GetUserRecipesResponse,
} from '../models';
import { NutritionLookupService } from '../services/nutrition-lookup.service';
import {
  RecipeRateLimitService,
  RecipeOperation,
} from '../../../shared/business-logic/rate-limiting/recipe-rate-limit.service';
import { RecipeAttribution, RecipeSource } from '../models';
import {
  processIngredients,
  calculateTotalNutrition,
} from '../../recipe-module/services/ingredient.service';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true, // Remove undefined values from objects
  },
});
const s3Client = new S3Client({});
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
});

// Environment variables
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const S3_BUCKET = process.env.S3_BUCKET || 'everyonecook-content-dev';
// Claude 3 Haiku - fast and cost-effective for nutrition lookup
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

// Constants
const MAX_IMAGES_PER_STEP = 3;

// Initialize services
const nutritionService = new NutritionLookupService(
  docClient,
  bedrockClient,
  DYNAMODB_TABLE,
  BEDROCK_MODEL_ID
);
const rateLimitService = new RecipeRateLimitService(DYNAMODB_TABLE);

/**
 * CORS headers for all responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Correlation-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Structured logger
 */
function logger(level: string, message: string, metadata?: Record<string, any>): void {
  if (LOG_LEVEL === 'DEBUG' || level !== 'DEBUG') {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        service: 'ai-module',
        handler: 'recipe',
        ...metadata,
      })
    );
  }
}

/**
 * Extract S3 key from CDN URL
 * Example: https://cdn-dev.everyonecook.cloud/recipes/user-123/recipe-456/completed.jpg
 * Returns: recipes/user-123/recipe-456/completed.jpg
 */
function extractS3KeyFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Remove leading slash from pathname
    return urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
  } catch {
    // If URL parsing fails, try to extract path after domain
    const match = url.match(/https?:\/\/[^\/]+\/(.+)/);
    return match ? match[1] : null;
  }
}

/**
 * Calculate nutrition for recipe ingredients
 *
 * @param ingredients - Recipe ingredients
 * @returns Total nutrition for recipe
 */
async function calculateRecipeNutrition(
  ingredients: CreateRecipeRequest['ingredients']
): Promise<RecipeEntity['nutrition']> {
  try {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    for (const ingredient of ingredients) {
      // Lookup nutrition for ingredient
      const result = await nutritionService.lookupIngredient(ingredient.vietnamese);

      if (result.nutrition) {
        // Parse amount (e.g., "500g" → 500)
        const amountMatch = ingredient.amount.match(/(\d+)/);
        const amountGrams = amountMatch ? parseInt(amountMatch[1]) : 100;
        const multiplier = amountGrams / 100;

        // Scale nutrition
        totalCalories += result.nutrition.per100g.calories * multiplier;
        totalProtein += result.nutrition.per100g.protein * multiplier;
        totalCarbs += result.nutrition.per100g.carbs * multiplier;
        totalFat += result.nutrition.per100g.fat * multiplier;
        totalFiber += result.nutrition.per100g.fiber * multiplier;
      }
    }

    return {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fat: Math.round(totalFat * 10) / 10,
      fiber: Math.round(totalFiber * 10) / 10,
    };
  } catch (error) {
    logger('WARN', 'Failed to calculate nutrition', { error });
    return undefined;
  }
}

/**
 * Create new recipe in Manager Recipe
 *
 * @param userId - User ID
 * @param request - Create recipe request
 * @returns Created recipe
 */
export async function createRecipe(
  userId: string,
  request: CreateRecipeRequest
): Promise<RecipeEntity> {
  // Check rate limit
  const rateLimit = await rateLimitService.checkRateLimit(userId, RecipeOperation.CREATE_RECIPE);
  if (!rateLimit.allowed) {
    throw new Error(
      `RATE_LIMIT_EXCEEDED: You can only create ${rateLimit.limit} recipes per day. Try again tomorrow.`
    );
  }

  const recipeId = uuidv4();
  const now = Date.now();

  // Process ingredients: normalize Vietnamese → lookup Dictionary/Cache → AI if needed
  // This ensures all ingredients have: normalized, english, category, nutrition, source
  logger('INFO', 'Processing ingredients', {
    ingredientsCount: request.ingredients?.length || 0,
    sampleIngredient: request.ingredients?.[0],
  });

  let processedIngredients: Awaited<ReturnType<typeof processIngredients>> = [];
  try {
    logger('INFO', 'Processing ingredients', {
      ingredientsCount: request.ingredients?.length || 0,
      sampleIngredient: request.ingredients?.[0],
    });
    processedIngredients = await processIngredients(request.ingredients);
    logger('INFO', 'Ingredients processed successfully', {
      processedCount: processedIngredients?.length || 0,
      sampleProcessed: processedIngredients?.[0],
    });
  } catch (processError) {
    logger('ERROR', 'Failed to process ingredients', {
      error: processError instanceof Error ? processError.message : 'Unknown error',
      stack: processError instanceof Error ? processError.stack : undefined,
    });
    // Fallback: map original ingredients to ProcessedIngredient format
    processedIngredients = (request.ingredients || []).map((ing) => ({
      vietnamese: ing.vietnamese,
      normalized: '',
      english: ing.english || ing.vietnamese,
      amount: ing.amount,
      notes: ing.notes,
      source: 'unknown' as const,
    }));
  }

  // Calculate nutrition from processed ingredients
  let nutrition = request.nutrition;
  if (!nutrition && processedIngredients.length > 0) {
    try {
      nutrition = calculateTotalNutrition(processedIngredients, request.servings || 2);
      logger('INFO', 'Nutrition calculated', { nutrition });
    } catch (nutritionError) {
      logger('WARN', 'Failed to calculate nutrition', {
        error: nutritionError instanceof Error ? nutritionError.message : 'Unknown error',
      });
    }
  }

  const recipe: RecipeEntity = {
    PK: `RECIPE#${recipeId}`,
    SK: 'METADATA',
    recipeId,
    title: request.title,
    description: request.description,
    ingredients: processedIngredients as any, // Processed with english, nutrition, source
    steps: request.steps,
    images: request.images,
    servings: request.servings,
    cookingTime: request.cookingTime,
    difficulty: request.difficulty,
    source: request.source,
    attribution: request.attribution, // Immutable for imported recipes
    nutrition,
    authorId: userId,
    isShared: false,
    sharedPostId: undefined,
    createdAt: now,
    updatedAt: now,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `RECIPE#${now}`,
    entityType: 'RECIPE',
  };

  await docClient.send(
    new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: recipe,
    })
  );

  // Add recipeId to User profile for strong consistency queries
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
        UpdateExpression: 'SET recipeIds = list_append(if_not_exists(recipeIds, :empty), :newId)',
        ExpressionAttributeValues: {
          ':empty': [],
          ':newId': [recipeId],
        },
      })
    );
    logger('DEBUG', 'Added recipeId to user profile', { userId, recipeId });
  } catch (error) {
    logger('WARN', 'Failed to add recipeId to user profile', {
      userId,
      recipeId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't fail recipe creation if this fails - GSI is fallback
  }

  // Increment rate limit counter
  await rateLimitService.incrementUsage(userId, RecipeOperation.CREATE_RECIPE);

  logger('INFO', 'Recipe created', {
    recipeId,
    userId,
    title: request.title,
    source: request.source,
    hasNutrition: !!nutrition,
  });

  return recipe;
}

/**
 * Get recipe details by ID
 *
 * @param recipeId - Recipe ID
 * @returns Recipe or null if not found
 */
export async function getRecipe(recipeId: string): Promise<RecipeEntity | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `RECIPE#${recipeId}`,
        SK: 'METADATA',
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return result.Item as RecipeEntity;
}

/**
 * Update recipe metadata
 *
 * Note: Cannot update source/attribution (immutable for imported recipes)
 * Imported recipes are READ-ONLY (can only delete)
 *
 * @param recipeId - Recipe ID
 * @param userId - User ID (for authorization)
 * @param request - Update recipe request
 * @returns Updated recipe
 */
export async function updateRecipe(
  recipeId: string,
  userId: string,
  request: UpdateRecipeRequest
): Promise<RecipeEntity> {
  // Get existing recipe
  const existing = await getRecipe(recipeId);

  if (!existing) {
    throw new Error('Recipe not found');
  }

  // Authorization check
  if (existing.authorId !== userId) {
    throw new Error('Unauthorized: You can only update your own recipes');
  }

  // Imported/Saved recipes are READ-ONLY (from social) - except for isFavorite toggle
  const isOnlyFavoriteUpdate = Object.keys(request).length === 1 && request.isFavorite !== undefined;
  if ((existing.source === 'imported' || existing.source === 'saved') && !isOnlyFavoriteUpdate) {
    throw new Error(
      'SOCIAL_RECIPE_READONLY: Recipes saved from social cannot be edited. You can only delete them or toggle favorite.'
    );
  }

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  if (request.title !== undefined) {
    updateExpressions.push('#title = :title');
    expressionAttributeNames['#title'] = 'title';
    expressionAttributeValues[':title'] = request.title;
  }

  if (request.description !== undefined) {
    updateExpressions.push('#description = :description');
    expressionAttributeNames['#description'] = 'description';
    expressionAttributeValues[':description'] = request.description;
  }

  if (request.ingredients !== undefined) {
    updateExpressions.push('#ingredients = :ingredients');
    expressionAttributeNames['#ingredients'] = 'ingredients';
    expressionAttributeValues[':ingredients'] = request.ingredients;
  }

  if (request.steps !== undefined) {
    updateExpressions.push('#steps = :steps');
    expressionAttributeNames['#steps'] = 'steps';
    expressionAttributeValues[':steps'] = request.steps;
  }

  if (request.images !== undefined) {
    updateExpressions.push('#images = :images');
    expressionAttributeNames['#images'] = 'images';
    expressionAttributeValues[':images'] = request.images;

    // Delete old S3 images if they are being replaced or removed
    const oldImages = existing.images;
    const newImages = request.images;

    // Collect S3 keys to delete
    const keysToDelete: string[] = [];

    // Check completed image
    if (oldImages?.completed && oldImages.completed !== newImages?.completed) {
      // Extract S3 key from CDN URL
      const oldKey = extractS3KeyFromUrl(oldImages.completed);
      if (oldKey) {
        keysToDelete.push(oldKey);
      }
    }

    // Check step images
    if (oldImages?.steps) {
      const newSteps = newImages?.steps || [];
      oldImages.steps.forEach((stepImages, stepIndex) => {
        const newStepImages = newSteps[stepIndex] || [];
        stepImages?.forEach((oldUrl) => {
          if (!newStepImages.includes(oldUrl)) {
            const oldKey = extractS3KeyFromUrl(oldUrl);
            if (oldKey) {
              keysToDelete.push(oldKey);
            }
          }
        });
      });
    }

    // Delete old images from S3 (async, don't block update)
    if (keysToDelete.length > 0) {
      deleteS3ObjectsWithRetry(S3_BUCKET, keysToDelete).then((result) => {
        if (result.success) {
          logger('INFO', 'Old recipe images deleted from S3', {
            recipeId,
            deletedCount: keysToDelete.length,
          });
        } else {
          logger('WARN', 'Some old recipe images failed to delete from S3', {
            recipeId,
            failedKeys: result.failedKeys,
          });
        }
      });
    }
  }

  if (request.servings !== undefined) {
    updateExpressions.push('#servings = :servings');
    expressionAttributeNames['#servings'] = 'servings';
    expressionAttributeValues[':servings'] = request.servings;
  }

  if (request.cookingTime !== undefined) {
    updateExpressions.push('#cookingTime = :cookingTime');
    expressionAttributeNames['#cookingTime'] = 'cookingTime';
    expressionAttributeValues[':cookingTime'] = request.cookingTime;
  }

  if (request.difficulty !== undefined) {
    updateExpressions.push('#difficulty = :difficulty');
    expressionAttributeNames['#difficulty'] = 'difficulty';
    expressionAttributeValues[':difficulty'] = request.difficulty;
  }

  if (request.nutrition !== undefined) {
    updateExpressions.push('#nutrition = :nutrition');
    expressionAttributeNames['#nutrition'] = 'nutrition';
    expressionAttributeValues[':nutrition'] = request.nutrition;
  }

  if (request.isFavorite !== undefined) {
    updateExpressions.push('#isFavorite = :isFavorite');
    expressionAttributeNames['#isFavorite'] = 'isFavorite';
    expressionAttributeValues[':isFavorite'] = request.isFavorite;
  }

  // Always update updatedAt
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = Date.now();

  if (updateExpressions.length === 0) {
    return existing;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `RECIPE#${recipeId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
  );

  logger('INFO', 'Recipe updated', {
    recipeId,
    userId,
    updatedFields: Object.keys(request),
  });

  return result.Attributes as RecipeEntity;
}

/**
 * Delete S3 objects with retry logic
 *
 * @param bucket - S3 bucket name
 * @param keys - Array of object keys to delete
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Object with success status and any failed keys
 */
async function deleteS3ObjectsWithRetry(
  bucket: string,
  keys: string[],
  maxRetries: number = 3
): Promise<{ success: boolean; failedKeys: string[] }> {
  let attempt = 0;
  let remainingKeys = [...keys];
  const failedKeys: string[] = [];

  while (attempt < maxRetries && remainingKeys.length > 0) {
    attempt++;

    try {
      const result = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: remainingKeys.map((key) => ({ Key: key })),
          },
        })
      );

      // Check for partial failures
      if (result.Errors && result.Errors.length > 0) {
        const errorKeys = result.Errors.map((e) => e.Key!);
        remainingKeys = errorKeys;

        logger('WARN', `S3 delete partial failure (attempt ${attempt}/${maxRetries})`, {
          bucket,
          failedCount: errorKeys.length,
          errors: result.Errors.map((e) => ({ key: e.Key, code: e.Code, message: e.Message })),
        });

        // Exponential backoff before retry
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      } else {
        // All deletions successful
        remainingKeys = [];
      }
    } catch (error) {
      logger('ERROR', `S3 delete error (attempt ${attempt}/${maxRetries})`, {
        bucket,
        keysCount: remainingKeys.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Exponential backoff before retry
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  // Any remaining keys are considered failed
  failedKeys.push(...remainingKeys);

  return {
    success: failedKeys.length === 0,
    failedKeys,
  };
}

/**
 * Delete recipe and S3 images
 *
 * Flow:
 * 1. Validate recipe exists and user is authorized
 * 2. Delete S3 images with retry logic
 * 3. Delete DynamoDB record
 * 4. Log orphaned files if S3 delete partially failed
 *
 * @param recipeId - Recipe ID
 * @param userId - User ID (for authorization)
 */
export async function deleteRecipe(recipeId: string, userId: string): Promise<void> {
  const startTime = Date.now();

  // Get existing recipe
  const existing = await getRecipe(recipeId);

  if (!existing) {
    throw new Error('Recipe not found');
  }

  // Authorization check
  if (existing.authorId !== userId) {
    throw new Error('Unauthorized: You can only delete your own recipes');
  }

  // Track S3 deletion status
  let s3DeleteSuccess = true;
  let s3FailedKeys: string[] = [];
  let s3ImageCount = 0;

  // Delete S3 images with retry
  try {
    const prefix = `recipes/${userId}/${recipeId}/`;

    // List all objects with prefix
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
      })
    );

    if (listResult.Contents && listResult.Contents.length > 0) {
      s3ImageCount = listResult.Contents.length;
      const keys = listResult.Contents.map((obj) => obj.Key!);

      // Delete with retry logic
      const deleteResult = await deleteS3ObjectsWithRetry(S3_BUCKET, keys);
      s3DeleteSuccess = deleteResult.success;
      s3FailedKeys = deleteResult.failedKeys;

      if (s3DeleteSuccess) {
        logger('INFO', 'Recipe images deleted from S3', {
          recipeId,
          userId,
          imageCount: s3ImageCount,
        });
      } else {
        logger('WARN', 'Some recipe images failed to delete from S3', {
          recipeId,
          userId,
          totalImages: s3ImageCount,
          failedCount: s3FailedKeys.length,
          failedKeys: s3FailedKeys,
        });
      }
    }
  } catch (error) {
    s3DeleteSuccess = false;
    logger('ERROR', 'Failed to delete recipe images from S3', {
      recipeId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Continue with DynamoDB deletion even if S3 deletion fails
  }

  // Delete from DynamoDB
  await docClient.send(
    new DeleteCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `RECIPE#${recipeId}`,
        SK: 'METADATA',
      },
    })
  );

  // Remove recipeId from User profile
  try {
    // Get current recipeIds from user profile
    const userResult = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        ProjectionExpression: 'recipeIds',
        ConsistentRead: true,
      })
    );
    
    const currentIds: string[] = userResult.Item?.recipeIds || [];
    const updatedIds = currentIds.filter((id: string) => id !== recipeId);
    
    if (currentIds.length !== updatedIds.length) {
      await docClient.send(
        new UpdateCommand({
          TableName: DYNAMODB_TABLE,
          Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
          UpdateExpression: 'SET recipeIds = :ids',
          ExpressionAttributeValues: { ':ids': updatedIds },
        })
      );
      logger('DEBUG', 'Removed recipeId from user profile', { userId, recipeId });
    }
  } catch (error) {
    logger('WARN', 'Failed to remove recipeId from user profile', {
      userId,
      recipeId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't fail deletion if this fails
  }

  const duration = Date.now() - startTime;

  // Log final status
  if (s3DeleteSuccess) {
    logger('INFO', 'Recipe deleted successfully', {
      recipeId,
      userId,
      s3ImagesDeleted: s3ImageCount,
      duration,
    });
  } else {
    // Log orphaned files for potential cleanup
    logger('WARN', 'Recipe deleted with orphaned S3 files', {
      recipeId,
      userId,
      orphanedFiles: s3FailedKeys,
      orphanedCount: s3FailedKeys.length,
      duration,
      // This can be used by a cleanup job to retry deletion
      cleanupRequired: true,
    });
  }
}

/**
 * Get user recipes (Recipe Picker API)
 *
 * Returns recipe summaries with optimized projection for performance.
 * Supports filters: search, difficulty, isShared status.
 *
 * STRONG CONSISTENCY: Queries recipeIds from User profile (main table)
 * then BatchGetItem for recipe details - both with ConsistentRead.
 *
 * @param request - Get user recipes request
 * @returns Recipe summaries with pagination
 */
export async function getUserRecipes(
  request: GetUserRecipesRequest
): Promise<GetUserRecipesResponse> {
  const startTime = Date.now();
  const limit = request.limit || 100; // Get all recipes, filter in memory

  // Step 1: Get recipeIds from User profile (STRONG CONSISTENCY)
  const userResult = await docClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `USER#${request.userId}`,
        SK: 'PROFILE',
      },
      ProjectionExpression: 'recipeIds',
      ConsistentRead: true, // Strong consistency!
    })
  );

  const step1Duration = Date.now() - startTime;
  let recipeIds: string[] = userResult.Item?.recipeIds || [];
  
  logger('INFO', 'getUserRecipes Step 1 - Get recipeIds from profile', {
    userId: request.userId,
    recipeIdsCount: recipeIds.length,
    hasRecipeIds: recipeIds.length > 0,
    duration: step1Duration,
  });
  
  // Fallback to GSI if recipeIds not in profile (for existing users)
  if (recipeIds.length === 0) {
    const gsiStartTime = Date.now();
    logger('INFO', 'No recipeIds in profile, falling back to GSI (eventual consistency)', { userId: request.userId });
    const gsiResult = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        IndexName: 'GSI1',
        Limit: limit,
        ScanIndexForward: false,
        ProjectionExpression: 'recipeId',
        KeyConditionExpression: 'GSI1PK = :userId AND begins_with(GSI1SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':userId': `USER#${request.userId}`,
          ':skPrefix': 'RECIPE#',
        },
      })
    );
    recipeIds = (gsiResult.Items || []).map((item: any) => item.recipeId).filter(Boolean);
    logger('INFO', 'GSI fallback completed', { 
      userId: request.userId, 
      recipeIdsCount: recipeIds.length,
      duration: Date.now() - gsiStartTime,
    });
    
    // Migrate: Save recipeIds to user profile for future queries
    if (recipeIds.length > 0) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: { PK: `USER#${request.userId}`, SK: 'PROFILE' },
            UpdateExpression: 'SET recipeIds = :ids',
            ExpressionAttributeValues: { ':ids': recipeIds },
          })
        );
        logger('INFO', 'Migrated recipeIds to user profile', { userId: request.userId, count: recipeIds.length });
      } catch (e) {
        logger('WARN', 'Failed to migrate recipeIds', { error: e });
      }
    }
  }

  if (recipeIds.length === 0) {
    return { recipes: [], total: 0, hasMore: false };
  }

  // Step 2: BatchGetItem from main table with Strong Consistency
  // BatchGetItem supports max 100 items per request
  const { BatchGetCommand } = await import('@aws-sdk/lib-dynamodb');
  let recipes: RecipeEntity[] = [];
  
  // Process in batches of 100
  for (let i = 0; i < recipeIds.length; i += 100) {
    const batchIds = recipeIds.slice(i, i + 100);
    const batchResult = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [DYNAMODB_TABLE]: {
            Keys: batchIds.map((id: string) => ({ PK: `RECIPE#${id}`, SK: 'METADATA' })),
            ConsistentRead: true, // Strong consistency!
          },
        },
      })
    );
    recipes.push(...((batchResult.Responses?.[DYNAMODB_TABLE] || []) as RecipeEntity[]));
  }

  // Sort by createdAt DESC (BatchGet doesn't preserve order)
  recipes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Log for debugging
  logger('DEBUG', 'getUserRecipes query result', {
    userId: request.userId,
    recipesFound: recipes.length,
    firstRecipe: recipes[0]
      ? {
          recipeId: recipes[0].recipeId,
          title: recipes[0].title,
          hasIngredients: !!recipes[0].ingredients,
          ingredientsLength: recipes[0].ingredients?.length,
        }
      : null,
  });

  // Apply filters
  if (request.search) {
    const searchLower = request.search.toLowerCase();
    recipes = recipes.filter((recipe) => recipe.title.toLowerCase().includes(searchLower));
  }

  if (request.difficulty) {
    recipes = recipes.filter((recipe) => recipe.difficulty === request.difficulty);
  }

  if (request.isShared !== undefined) {
    recipes = recipes.filter((recipe) => recipe.isShared === request.isShared);
  }

  // Convert to recipe summaries
  const summaries: RecipeSummary[] = recipes.map((recipe) => ({
    recipeId: recipe.recipeId,
    title: recipe.title,
    thumbnail: recipe.images?.completed || '',
    ingredientsCount: recipe.ingredients?.length || 0,
    servings: recipe.servings,
    cookingTime: recipe.cookingTime,
    difficulty: recipe.difficulty,
    createdAt: recipe.createdAt,
    isFavorite: recipe.isFavorite || false,
    isShared: recipe.isShared,
    sharedPostId: recipe.sharedPostId || null,
    source: recipe.source || 'manual', // Include source field
  }));

  const totalDuration = Date.now() - startTime;
  logger('INFO', 'User recipes retrieved with strong consistency', {
    userId: request.userId,
    count: summaries.length,
    totalDuration,
    favoritesCount: summaries.filter(s => s.isFavorite).length,
  });

  // No pagination needed - all recipes loaded from User profile
  return {
    recipes: summaries,
    total: summaries.length,
    hasMore: false,
  };
}

/**
 * Get recipe details for sharing (Recipe Picker)
 *
 * Returns full recipe details including images, ingredients, steps, nutrition.
 * Used by Social Module when user selects recipe from picker.
 *
 * @param recipeId - Recipe ID
 * @returns Recipe details or null if not found
 */
export async function getRecipeDetails(recipeId: string): Promise<RecipeDetails | null> {
  const recipe = await getRecipe(recipeId);

  if (!recipe) {
    return null;
  }

  const details: RecipeDetails = {
    recipeId: recipe.recipeId,
    title: recipe.title,
    description: recipe.description,
    images: recipe.images,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    nutrition: recipe.nutrition,
    servings: recipe.servings,
    cookingTime: recipe.cookingTime,
    difficulty: recipe.difficulty,
    source: recipe.source,
    attribution: recipe.attribution,
    isFavorite: recipe.isFavorite || false,
  };

  logger('INFO', 'Recipe details retrieved', {
    recipeId,
  });

  return details;
}

/**
 * Update recipe sharing status
 *
 * Called by Social Module when recipe is shared to feed.
 * Creates bidirectional link: recipeId ↔ postId
 *
 * @param recipeId - Recipe ID
 * @param postId - Post ID (or null to unshare)
 */
export async function updateRecipeSharing(recipeId: string, postId: string | null): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `RECIPE#${recipeId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET isShared = :isShared, sharedPostId = :postId, updatedAt = :now',
      ExpressionAttributeValues: {
        ':isShared': !!postId,
        ':postId': postId,
        ':now': Date.now(),
      },
    })
  );

  logger('INFO', 'Recipe sharing status updated', {
    recipeId,
    postId,
    isShared: !!postId,
  });
}

/**
 * Generate recipe with AI (from AI suggestions)
 *
 * @param userId - User ID
 * @param aiRecipeData - AI-generated recipe data
 * @returns Created recipe
 */
export async function generateRecipeWithAI(
  userId: string,
  aiRecipeData: any
): Promise<RecipeEntity> {
  const request: CreateRecipeRequest = {
    title: aiRecipeData.title,
    description: aiRecipeData.description,
    ingredients: aiRecipeData.ingredients,
    steps: aiRecipeData.steps,
    images: aiRecipeData.images || { completed: '' },
    servings: aiRecipeData.servings || 4,
    cookingTime: aiRecipeData.cookingTime || 30,
    difficulty: aiRecipeData.difficulty || 'medium',
    source: 'ai',
    nutrition: aiRecipeData.nutrition,
  };

  return await createRecipe(userId, request);
}

/**
 * Save recipe (from AI results or Feed posts)
 *
 * @param userId - User ID
 * @param recipeId - Original recipe ID
 * @returns Saved recipe copy
 */
export async function saveRecipe(userId: string, recipeId: string): Promise<RecipeEntity> {
  // Get original recipe
  const original = await getRecipe(recipeId);

  if (!original) {
    throw new Error('Recipe not found');
  }

  // Determine source and check rate limit
  const source: RecipeSource = original.source === 'ai' ? 'ai' : 'imported';

  if (source === 'imported') {
    const rateLimit = await rateLimitService.checkRateLimit(userId, RecipeOperation.SAVE_FROM_FEED);
    if (!rateLimit.allowed) {
      throw new Error(
        `RATE_LIMIT_EXCEEDED: You can only save ${rateLimit.limit} recipes from feed per day. Try again tomorrow.`
      );
    }
  }

  // Create attribution for imported recipes
  const attribution: RecipeAttribution | undefined =
    source === 'imported'
      ? {
          originalAuthorId: original.authorId,
          originalAuthorUsername: 'Unknown', // Should be fetched from user profile
          importedAt: Date.now(),
        }
      : undefined;

  // Create copy
  const request: CreateRecipeRequest = {
    title: original.title,
    description: original.description,
    ingredients: original.ingredients,
    steps: original.steps,
    images: original.images,
    servings: original.servings,
    cookingTime: original.cookingTime,
    difficulty: original.difficulty,
    source,
    attribution,
    nutrition: original.nutrition,
  };

  const savedRecipe = await createRecipe(userId, request);

  // Increment rate limit for imported recipes
  if (source === 'imported') {
    await rateLimitService.incrementUsage(userId, RecipeOperation.SAVE_FROM_FEED);
  }

  return savedRecipe;
}

/**
 * List user recipes (for Recipe Picker)
 *
 * @param userId - User ID
 * @param queryParams - Query parameters
 * @returns User recipes
 */
export async function listUserRecipes(
  userId: string,
  queryParams: any
): Promise<GetUserRecipesResponse> {
  const request: GetUserRecipesRequest = {
    userId,
    search: queryParams.search,
    difficulty: queryParams.difficulty,
    isShared:
      queryParams.isShared === 'true' ? true : queryParams.isShared === 'false' ? false : undefined,
    limit: queryParams.limit ? parseInt(queryParams.limit) : 20,
    cursor: queryParams.cursor,
  };

  return await getUserRecipes(request);
}

/**
 * Lambda handler for recipe management
 *
 * Routes:
 * - POST /recipes → Create recipe
 * - POST /recipes/generate-ai → Generate recipe with AI
 * - POST /recipes/search → Search recipes
 * - POST /recipes/{recipeId}/save → Save recipe
 * - GET /recipes → Get user recipes (Recipe Picker)
 * - GET /recipes/{recipeId} → Get recipe details
 * - GET /users/{userId}/recipes → Get user recipes
 * - PUT /recipes/{recipeId} → Update recipe
 * - DELETE /recipes/{recipeId} → Delete recipe
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const correlationId = event.headers['x-correlation-id'] || uuidv4();

  try {
    // Extract user ID from JWT (set by API Gateway authorizer)
    const userId = event.requestContext.authorizer?.claims?.sub;

    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
            correlationId,
          },
        }),
      };
    }

    const method = event.httpMethod;
    const path = event.path;
    const pathParams = event.pathParameters;

    logger('INFO', 'Recipe handler request', {
      correlationId,
      method,
      path,
      userId,
    });

    // POST /v1/recipes/generate-ai → Generate recipe with AI
    if (method === 'POST' && path.endsWith('/recipes/generate-ai')) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
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

      const aiRecipeData = JSON.parse(event.body);
      const recipe = await generateRecipeWithAI(userId, aiRecipeData);

      const duration = Date.now() - startTime;

      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          recipe,
          duration,
        }),
      };
    }

    // POST /v1/recipes/{recipeId}/save → Save recipe
    if (method === 'POST' && path.includes('/save')) {
      const recipeId = pathParams?.recipeId;

      if (!recipeId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            error: {
              code: 'MISSING_RECIPE_ID',
              message: 'Recipe ID is required',
              correlationId,
            },
          }),
        };
      }

      try {
        const recipe = await saveRecipe(userId, recipeId);

        const duration = Date.now() - startTime;

        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            recipe,
            duration,
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('RATE_LIMIT_EXCEEDED')) {
          return {
            statusCode: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: error.message.split(': ')[1],
                correlationId,
              },
            }),
          };
        }

        if (error instanceof Error && error.message.includes('not found')) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'RECIPE_NOT_FOUND',
                message: error.message,
                correlationId,
              },
            }),
          };
        }
        throw error;
      }
    }

    // GET /v1/users/{userId}/recipes → Get user recipes
    if (method === 'GET' && path.match(/\/users\/[^/]+\/recipes/)) {
      const targetUserId = pathParams?.userId || userId;
      const queryParams = event.queryStringParameters || {};

      const response = await listUserRecipes(targetUserId, queryParams);

      const duration = Date.now() - startTime;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'private, max-age=60',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          ...response,
          duration,
        }),
      };
    }

    // POST /recipes/search → Search recipes
    if (method === 'POST' && path.endsWith('/recipes/search')) {
      const queryParams = event.queryStringParameters || {};
      const body = event.body ? JSON.parse(event.body) : {};

      const request: GetUserRecipesRequest = {
        userId,
        search: body.search || queryParams.search,
        difficulty: body.difficulty || queryParams.difficulty,
        isShared:
          body.isShared !== undefined
            ? body.isShared
            : queryParams.isShared === 'true'
              ? true
              : queryParams.isShared === 'false'
                ? false
                : undefined,
        limit: body.limit || (queryParams.limit ? parseInt(queryParams.limit) : 20),
        cursor: body.cursor || queryParams.cursor,
      };

      const response = await getUserRecipes(request);

      const duration = Date.now() - startTime;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'private, max-age=60',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          ...response,
          duration,
        }),
      };
    }

    // POST /recipes → Create recipe
    if (method === 'POST' && path.endsWith('/recipes')) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
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

      const request: CreateRecipeRequest = JSON.parse(event.body);

      // Validate required fields (images is optional)
      if (!request.title || !request.ingredients || !request.steps) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Missing required fields: title, ingredients, steps',
              correlationId,
            },
          }),
        };
      }

      // Validate step images limit
      if (request.steps) {
        for (const step of request.steps) {
          if (step.images && step.images.length > MAX_IMAGES_PER_STEP) {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'X-Correlation-Id': correlationId,
                ...CORS_HEADERS,
              },
              body: JSON.stringify({
                error: {
                  code: 'INVALID_REQUEST',
                  message: `Step ${step.stepNumber} has too many images. Maximum ${MAX_IMAGES_PER_STEP} images per step.`,
                  correlationId,
                },
              }),
            };
          }
        }
      }

      try {
        const recipe = await createRecipe(userId, request);

        const duration = Date.now() - startTime;

        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            recipe,
            duration,
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('RATE_LIMIT_EXCEEDED')) {
          return {
            statusCode: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: error.message.split(': ')[1],
                correlationId,
              },
            }),
          };
        }
        throw error;
      }
    }

    // GET /recipes → Get user recipes (Recipe Picker)
    if (method === 'GET' && path.endsWith('/recipes')) {
      const queryParams = event.queryStringParameters || {};

      const request: GetUserRecipesRequest = {
        userId,
        search: queryParams.search,
        difficulty: queryParams.difficulty as any,
        isShared:
          queryParams.isShared === 'true'
            ? true
            : queryParams.isShared === 'false'
              ? false
              : undefined,
        limit: queryParams.limit ? parseInt(queryParams.limit) : 20,
        cursor: queryParams.cursor,
      };

      const response = await getUserRecipes(request);

      const duration = Date.now() - startTime;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'private, max-age=60', // 1 minute cache
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          ...response,
          duration,
        }),
      };
    }

    // GET /recipes/{recipeId} → Get recipe details
    if (method === 'GET' && pathParams?.recipeId) {
      const recipeId = pathParams.recipeId;

      const details = await getRecipeDetails(recipeId);

      if (!details) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            error: {
              code: 'RECIPE_NOT_FOUND',
              message: 'Recipe not found',
              correlationId,
            },
          }),
        };
      }

      const duration = Date.now() - startTime;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'private, max-age=300', // 5 minutes cache
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          recipe: details,
          duration,
        }),
      };
    }

    // PUT /recipes/{recipeId} → Update recipe
    if (method === 'PUT' && pathParams?.recipeId) {
      const recipeId = pathParams.recipeId;

      if (!event.body) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
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

      const request: UpdateRecipeRequest = JSON.parse(event.body);

      // Validate step images limit
      if (request.steps) {
        for (const step of request.steps) {
          if (step.images && step.images.length > MAX_IMAGES_PER_STEP) {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'X-Correlation-Id': correlationId,
                ...CORS_HEADERS,
              },
              body: JSON.stringify({
                error: {
                  code: 'INVALID_REQUEST',
                  message: `Step ${step.stepNumber} has too many images. Maximum ${MAX_IMAGES_PER_STEP} images per step.`,
                  correlationId,
                },
              }),
            };
          }
        }
      }

      try {
        const recipe = await updateRecipe(recipeId, userId, request);

        const duration = Date.now() - startTime;

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            recipe,
            duration,
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('RATE_LIMIT_EXCEEDED')) {
          return {
            statusCode: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: error.message.split(': ')[1],
                correlationId,
              },
            }),
          };
        }

        if (error instanceof Error && (error.message.includes('IMPORTED_RECIPE_READONLY') || error.message.includes('SOCIAL_RECIPE_READONLY'))) {
          return {
            statusCode: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'SOCIAL_RECIPE_READONLY',
                message: 'Recipes saved from social cannot be edited. You can only delete them or toggle favorite.',
                correlationId,
              },
            }),
          };
        }

        if (error instanceof Error && error.message.includes('Unauthorized')) {
          return {
            statusCode: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'FORBIDDEN',
                message: error.message,
                correlationId,
              },
            }),
          };
        }

        if (error instanceof Error && error.message.includes('not found')) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'RECIPE_NOT_FOUND',
                message: error.message,
                correlationId,
              },
            }),
          };
        }

        throw error;
      }
    }

    // DELETE /recipes/{recipeId} → Delete recipe
    if (method === 'DELETE' && pathParams?.recipeId) {
      const recipeId = pathParams.recipeId;

      try {
        await deleteRecipe(recipeId, userId);

        const duration = Date.now() - startTime;

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            message: 'Recipe deleted successfully',
            recipeId,
            duration,
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unauthorized')) {
          return {
            statusCode: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-Id': correlationId,
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              error: {
                code: 'FORBIDDEN',
                message: error.message,
                correlationId,
              },
            }),
          };
        }

        throw error;
      }
    }

    // Route not found
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        ...CORS_HEADERS,
      },
      body: JSON.stringify({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'Route not found',
          correlationId,
        },
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger('ERROR', 'Recipe handler failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        ...CORS_HEADERS,
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process recipe request',
          correlationId,
        },
      }),
    };
  }
}
