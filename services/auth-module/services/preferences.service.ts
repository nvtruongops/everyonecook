/**
 * Preferences Service
 *
 * Business logic for user cooking preferences
 * - Get/update stable preferences (long-term)
 * - Get/update frequent preferences (context-specific)
 *
 * @module services/preferences
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  StablePreferences,
  FrequentPreferences,
  UpdateStablePreferencesRequest,
  UpdateFrequentPreferencesRequest,
} from '../models/preferences.model';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME || 'EveryoneCook-dev-v2';

/**
 * Get stable preferences
 */
export async function getStablePreferences(userId: string): Promise<StablePreferences | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFERENCES#STABLE',
      },
    })
  );

  return result.Item as StablePreferences | null;
}

/**
 * Get frequent preferences
 */
export async function getFrequentPreferences(userId: string): Promise<FrequentPreferences | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFERENCES#FREQUENT',
      },
    })
  );

  return result.Item as FrequentPreferences | null;
}

/**
 * Create default stable preferences
 */
export async function createDefaultStablePreferences(userId: string): Promise<StablePreferences> {
  const now = Date.now();
  const defaultPreferences: StablePreferences = {
    PK: `USER#${userId}`,
    SK: 'PREFERENCES#STABLE',
    userId,
    skillLevel: 'intermediate',
    spiceLevel: 'medium',
    dietaryRestrictions: [],
    dislikedIngredients: [],
    favoriteCuisines: [],
    budgetLevel: 'moderate',
    kitchenEquipment: ['stove', 'oven', 'microwave'],
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: defaultPreferences,
    })
  );

  return defaultPreferences;
}

/**
 * Create default frequent preferences
 */
export async function createDefaultFrequentPreferences(
  userId: string
): Promise<FrequentPreferences> {
  const now = Date.now();
  const defaultPreferences: FrequentPreferences = {
    PK: `USER#${userId}`,
    SK: 'PREFERENCES#FREQUENT',
    userId,
    recentIngredients: [],
    recentMealTypes: [],
    recentServings: 4,
    recentMaxTime: 60,
    lastUsedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: defaultPreferences,
    })
  );

  return defaultPreferences;
}

/**
 * Update stable preferences
 */
export async function updateStablePreferences(
  userId: string,
  updates: UpdateStablePreferencesRequest
): Promise<StablePreferences> {
  const now = Date.now();

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  if (updates.skillLevel !== undefined) {
    updateExpressions.push('#skillLevel = :skillLevel');
    expressionAttributeNames['#skillLevel'] = 'skillLevel';
    expressionAttributeValues[':skillLevel'] = updates.skillLevel;
  }

  if (updates.spiceLevel !== undefined) {
    updateExpressions.push('#spiceLevel = :spiceLevel');
    expressionAttributeNames['#spiceLevel'] = 'spiceLevel';
    expressionAttributeValues[':spiceLevel'] = updates.spiceLevel;
  }

  if (updates.dietaryRestrictions !== undefined) {
    updateExpressions.push('#dietaryRestrictions = :dietaryRestrictions');
    expressionAttributeNames['#dietaryRestrictions'] = 'dietaryRestrictions';
    expressionAttributeValues[':dietaryRestrictions'] = updates.dietaryRestrictions;
  }

  if (updates.dislikedIngredients !== undefined) {
    updateExpressions.push('#dislikedIngredients = :dislikedIngredients');
    expressionAttributeNames['#dislikedIngredients'] = 'dislikedIngredients';
    expressionAttributeValues[':dislikedIngredients'] = updates.dislikedIngredients;
  }

  if (updates.favoriteCuisines !== undefined) {
    updateExpressions.push('#favoriteCuisines = :favoriteCuisines');
    expressionAttributeNames['#favoriteCuisines'] = 'favoriteCuisines';
    expressionAttributeValues[':favoriteCuisines'] = updates.favoriteCuisines;
  }

  if (updates.budgetLevel !== undefined) {
    updateExpressions.push('#budgetLevel = :budgetLevel');
    expressionAttributeNames['#budgetLevel'] = 'budgetLevel';
    expressionAttributeValues[':budgetLevel'] = updates.budgetLevel;
  }

  if (updates.kitchenEquipment !== undefined) {
    updateExpressions.push('#kitchenEquipment = :kitchenEquipment');
    expressionAttributeNames['#kitchenEquipment'] = 'kitchenEquipment';
    expressionAttributeValues[':kitchenEquipment'] = updates.kitchenEquipment;
  }

  // Always update timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = now;

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFERENCES#STABLE',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as StablePreferences;
}

/**
 * Update frequent preferences
 */
export async function updateFrequentPreferences(
  userId: string,
  updates: UpdateFrequentPreferencesRequest
): Promise<FrequentPreferences> {
  const now = Date.now();

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  if (updates.recentIngredients !== undefined) {
    // Keep only last 20 ingredients
    const ingredients = updates.recentIngredients.slice(-20);
    updateExpressions.push('#recentIngredients = :recentIngredients');
    expressionAttributeNames['#recentIngredients'] = 'recentIngredients';
    expressionAttributeValues[':recentIngredients'] = ingredients;
  }

  if (updates.recentMealTypes !== undefined) {
    // Keep only last 10 meal types
    const mealTypes = updates.recentMealTypes.slice(-10);
    updateExpressions.push('#recentMealTypes = :recentMealTypes');
    expressionAttributeNames['#recentMealTypes'] = 'recentMealTypes';
    expressionAttributeValues[':recentMealTypes'] = mealTypes;
  }

  if (updates.recentServings !== undefined) {
    updateExpressions.push('#recentServings = :recentServings');
    expressionAttributeNames['#recentServings'] = 'recentServings';
    expressionAttributeValues[':recentServings'] = updates.recentServings;
  }

  if (updates.recentMaxTime !== undefined) {
    updateExpressions.push('#recentMaxTime = :recentMaxTime');
    expressionAttributeNames['#recentMaxTime'] = 'recentMaxTime';
    expressionAttributeValues[':recentMaxTime'] = updates.recentMaxTime;
  }

  // Always update timestamp
  updateExpressions.push('#lastUsedAt = :lastUsedAt');
  expressionAttributeNames['#lastUsedAt'] = 'lastUsedAt';
  expressionAttributeValues[':lastUsedAt'] = now;

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFERENCES#FREQUENT',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as FrequentPreferences;
}
