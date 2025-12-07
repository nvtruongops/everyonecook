/**
 * Get Database Stats Handler
 *
 * Admin endpoint to retrieve database statistics for the admin dashboard.
 *
 * GET /admin/stats
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

interface DatabaseStats {
  timestamp: string;
  counts: {
    total_users: number;
    active_users: number;
    suspended_users: number;
    total_ingredients: number;
    dictionary_ingredients: number; // Direct, đã duyệt
    cache_ingredients: number; // AI tạo, chờ promote (100+)
    total_recipes: number; // Recipes trong quản lý món ăn
    recipe_posts: number; // Posts có công thức (postType = 'recipe_share')
    total_posts: number;
    total_cooking_sessions: number;
    total_violations: number;
    total_ai_cache: number; // AI recipes 24h TTL
  };
  growth: {
    new_users_today: number;
    new_users_this_week: number;
    new_users_this_month: number;
    new_recipes_today: number;
    new_recipes_this_week: number;
    new_recipes_this_month: number;
  };
}

/**
 * Get Database Stats Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `admin-${Date.now()}`;

  console.log('[GetStats] Starting handler', { correlationId, tableName: TABLE_NAME });

  try {
    // Authorization check
    console.log('[GetStats] Checking admin role...');
    requireAdminRole(event);
    console.log('[GetStats] Admin role verified');

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Get user stats
    console.log('[GetStats] Fetching user stats from table:', TABLE_NAME);
    let users: any[] = [];
    let totalUsers = 0;
    let suspendedUsers = 0;
    let activeUsers = 0;
    let newUsersToday = 0;
    let newUsersWeek = 0;
    let newUsersMonth = 0;

    try {
      const usersResult = await dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'SK = :sk',
          ExpressionAttributeValues: { ':sk': 'PROFILE' },
          ProjectionExpression:
            'userId, username, createdAt, isBanned, lastLoginAt, lastActivityAt, #r',
          ExpressionAttributeNames: { '#r': 'role' },
        })
      );
      // Filter out admin users from stats
      users = (usersResult.Items || []).filter((u) => u.role !== 'admin' && u.username !== 'admin');
      totalUsers = users.length;
      suspendedUsers = users.filter((u) => u.isBanned).length;
      // Use lastActivityAt (preferred) or lastLoginAt as fallback
      activeUsers = users.filter(
        (u) => (u.lastActivityAt || u.lastLoginAt || 0) >= monthAgo
      ).length;
      newUsersToday = users.filter((u) => (u.createdAt || 0) >= todayTimestamp).length;
      newUsersWeek = users.filter((u) => (u.createdAt || 0) >= weekAgo).length;
      newUsersMonth = users.filter((u) => (u.createdAt || 0) >= monthAgo).length;
      console.log('[GetStats] User stats fetched:', { totalUsers, suspendedUsers, activeUsers });
    } catch (userError) {
      console.error('[GetStats] Failed to fetch user stats:', userError);
    }

    // Get posts stats
    let totalPosts = 0;
    let recipePosts = 0; // Posts with recipe (postType = 'recipe_share')
    try {
      const postsResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: { ':pk': 'POST#PUBLIC' },
          ProjectionExpression: 'postId, postType',
        })
      );
      const posts = postsResult.Items || [];
      totalPosts = posts.length;
      // Count posts with recipe (postType = 'recipe_share')
      recipePosts = posts.filter((p) => p.postType === 'recipe_share').length;
    } catch (e) {
      console.log('Posts query failed, using 0');
    }

    // Get recipes stats
    let totalRecipes = 0;
    let newRecipesToday = 0;
    let newRecipesWeek = 0;
    let newRecipesMonth = 0;
    try {
      const recipesResult = await dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':sk': 'RECIPE#' },
          ProjectionExpression: 'recipeId, createdAt',
        })
      );
      const recipes = recipesResult.Items || [];
      totalRecipes = recipes.length;
      newRecipesToday = recipes.filter((r) => (r.createdAt || 0) >= todayTimestamp).length;
      newRecipesWeek = recipes.filter((r) => (r.createdAt || 0) >= weekAgo).length;
      newRecipesMonth = recipes.filter((r) => (r.createdAt || 0) >= monthAgo).length;
    } catch (e) {
      console.log('Recipes query failed, using 0');
    }

    // Get ingredients count from Dictionary (permanent, approved ingredients)
    let dictionaryIngredients = 0;
    try {
      const dictionaryResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': 'DICTIONARY', ':sk': 'INGREDIENT#' },
          Select: 'COUNT',
        })
      );
      dictionaryIngredients = dictionaryResult.Count || 0;
    } catch (e) {
      console.log('Dictionary ingredients query failed');
    }

    // Get translation cache count (AI-discovered ingredients, 1 year TTL)
    let translationCacheIngredients = 0;
    try {
      const cacheResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': 'TRANSLATION_CACHE' },
          Select: 'COUNT',
        })
      );
      translationCacheIngredients = cacheResult.Count || 0;
    } catch (e) {
      console.log('Translation cache query failed');
    }

    const totalIngredients = dictionaryIngredients + translationCacheIngredients;

    // Get violations count
    let totalViolations = 0;
    try {
      const violationsResult = await dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':sk': 'VIOLATION#' },
          Select: 'COUNT',
        })
      );
      totalViolations = violationsResult.Count || 0;
    } catch (e) {
      console.log('Violations query failed, using 0');
    }

    // Get AI cache count (24h TTL entries)
    let totalAiCache = 0;
    try {
      const aiCacheResult = await dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
          ExpressionAttributeValues: { ':pk': 'AI_CACHE#', ':sk': 'METADATA' },
          Select: 'COUNT',
        })
      );
      totalAiCache = aiCacheResult.Count || 0;
    } catch (e) {
      console.log('AI cache query failed, using 0');
    }

    const stats: DatabaseStats = {
      timestamp: new Date().toISOString(),
      counts: {
        total_users: totalUsers,
        active_users: activeUsers,
        suspended_users: suspendedUsers,
        total_ingredients: totalIngredients,
        dictionary_ingredients: dictionaryIngredients,
        cache_ingredients: translationCacheIngredients,
        total_recipes: totalRecipes,
        recipe_posts: recipePosts, // Posts with recipe (postType = 'recipe_share')
        total_posts: totalPosts,
        total_cooking_sessions: 0,
        total_violations: totalViolations,
        total_ai_cache: totalAiCache,
      },
      growth: {
        new_users_today: newUsersToday,
        new_users_this_week: newUsersWeek,
        new_users_this_month: newUsersMonth,
        new_recipes_today: newRecipesToday,
        new_recipes_this_week: newRecipesWeek,
        new_recipes_this_month: newRecipesMonth,
      },
    };

    return createSuccessResponse(200, stats, correlationId);
  } catch (error) {
    console.error('[GetStats] Handler error:', error);
    return handleError(error, correlationId);
  }
}
