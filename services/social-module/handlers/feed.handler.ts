/**
 * Feed Handlers
 *
 * API handlers for social feed generation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { FeedService } from '../services/feed.service';
import { getUserId } from '../shared/cognito.utils';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

const feedService = new FeedService();

/**
 * Fetch user info for multiple user IDs
 * Returns map of userId -> { username, avatarUrl }
 */
async function fetchUserInfoBatch(
  userIds: string[]
): Promise<Map<string, { username: string; avatarUrl?: string }>> {
  const userMap = new Map<string, { username: string; avatarUrl?: string }>();

  if (userIds.length === 0) return userMap;

  // Deduplicate user IDs
  const uniqueUserIds = [...new Set(userIds)];

  // BatchGet has limit of 100 items
  const batches = [];
  for (let i = 0; i < uniqueUserIds.length; i += 100) {
    batches.push(uniqueUserIds.slice(i, i + 100));
  }

  for (const batch of batches) {
    try {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: {
              Keys: batch.map((userId) => ({
                PK: `USER#${userId}`,
                SK: 'PROFILE',
              })),
              ProjectionExpression: 'userId, username, avatarUrl',
            },
          },
        })
      );

      const items = result.Responses?.[TABLE_NAME] || [];
      for (const item of items) {
        userMap.set(item.userId, {
          username: item.username || item.userId,
          avatarUrl: item.avatarUrl,
        });
      }
    } catch (error) {
      console.error('Error fetching user info batch:', error);
    }
  }

  return userMap;
}

/**
 * Helper function to create API response
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Fetch user's reactions for multiple posts
 * Returns map of postId -> reactionType
 */
async function fetchUserReactionsBatch(
  userId: string,
  postIds: string[]
): Promise<Map<string, string>> {
  const reactionMap = new Map<string, string>();

  if (!userId || postIds.length === 0) return reactionMap;

  // Deduplicate post IDs
  const uniquePostIds = [...new Set(postIds)];

  // Fetch reactions in parallel (limit to 25 concurrent requests)
  const batchSize = 25;
  for (let i = 0; i < uniquePostIds.length; i += batchSize) {
    const batch = uniquePostIds.slice(i, i + batchSize);
    const promises = batch.map(async (postId) => {
      try {
        const result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `POST#${postId}`,
              SK: `REACTION#${userId}`,
            },
            ProjectionExpression: 'reactionType',
          })
        );
        if (result.Item?.reactionType) {
          reactionMap.set(postId, result.Item.reactionType);
        }
      } catch (error) {
        // Ignore errors for individual reactions
      }
    });
    await Promise.all(promises);
  }

  return reactionMap;
}

/**
 * Transform post from DynamoDB format to API response format
 * Maps: postId -> post_id, authorId -> user_id, title -> content, etc.
 * @param post - Post from DynamoDB
 * @param userInfo - Optional user info (username, avatar)
 * @param userReaction - Optional user's reaction type for this post
 * @param originalPostData - Optional original post data for shared posts
 */
function transformPostForResponse(
  post: any,
  userInfo?: { username?: string; avatarUrl?: string },
  userReaction?: string,
  originalPostData?: any
): any {
  const baseResponse = {
    // API format (snake_case)
    post_id: post.postId,
    user_id: post.authorId,
    username: userInfo?.username || post.authorUsername || post.authorId,
    user_avatar: userInfo?.avatarUrl || post.authorAvatar,
    content: post.title, // title is displayed as content in feed
    caption: post.caption,
    // For recipe_share posts, don't include completed image in images array
    // (it's already shown in recipeData.images.completed)
    images:
      post.postType === 'recipe_share'
        ? [] // Recipe posts show image in recipe card, not in post images
        : post.postType === 'shared'
          ? [] // Shared posts don't have their own images
          : post.images?.quickImages || [],
    recipe_id: post.recipeId,
    privacy: post.privacyLevel,
    is_public: post.privacyLevel === 'public',
    likes_count: post.likes || 0,
    comments_count: post.comments || 0,
    shares_count: post.shares || 0,
    user_reaction: userReaction, // User's reaction to this post
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    // Include recipe data if available - use embedded recipeData if exists
    recipeData:
      post.postType === 'recipe_share'
        ? post.recipeData
          ? {
              // Use full embedded recipe data
              title: post.recipeData.title || post.title,
              description: post.recipeData.description,
              ingredients: post.recipeData.ingredients || [],
              steps: post.recipeData.steps || [],
              images: post.recipeData.images,
              cookingTime: post.recipeData.cookingTime || post.cookingTime,
              servings: post.recipeData.servings || post.servings,
              difficulty: post.recipeData.difficulty || post.difficulty,
              nutrition: post.recipeData.nutrition || post.nutrition,
            }
          : {
              // Fallback to legacy fields for old posts
              title: post.title,
              ingredients: post.ingredients?.map((ing: string) => ({ vietnamese: ing })) || [],
              steps: [],
              cookingTime: post.cookingTime,
              servings: post.servings,
              difficulty: post.difficulty,
              nutrition: post.nutrition,
            }
        : undefined,
    // Attribution for recipes saved from social (credit original author)
    recipeAttribution: post.recipeAttribution || undefined,
    // Keep original format for backward compatibility
    postId: post.postId,
    authorId: post.authorId,
    title: post.title,
    postType: post.postType,
    privacyLevel: post.privacyLevel,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };

  // Add shared post data if this is a shared post
  if (post.postType === 'shared' && post.sharedPost) {
    const sharedPostRef = post.sharedPost;
    const originalPost = originalPostData || null;
    const isOriginalDeleted = !originalPost;

    return {
      ...baseResponse,
      sharedPost: {
        originalPostId: sharedPostRef.originalPostId,
        originalAuthorId: sharedPostRef.originalAuthorId,
        originalAuthorUsername: originalPost?.username || sharedPostRef.originalAuthorUsername,
        originalAuthorAvatar: originalPost?.authorAvatar || sharedPostRef.originalAuthorAvatar,
        sharedAt: sharedPostRef.sharedAt,
        isDeleted: isOriginalDeleted,
        originalPost: isOriginalDeleted
          ? {
              isDeleted: true,
              title: sharedPostRef.snapshot?.title || 'Bài viết không khả dụng',
              content: sharedPostRef.snapshot?.content,
              images: sharedPostRef.snapshot?.images || [],
              recipeData: sharedPostRef.snapshot?.recipeData,
              postType: sharedPostRef.snapshot?.postType,
            }
          : {
              isDeleted: false,
              post_id: originalPost.postId,
              user_id: originalPost.authorId,
              username: originalPost.username || originalPost.authorId,
              user_avatar: originalPost.authorAvatar,
              title: originalPost.title,
              content: originalPost.title,
              caption: originalPost.caption,
              images: originalPost.images?.quickImages || [],
              postType: originalPost.postType,
              recipeData: originalPost.recipeData,
              recipe_id: originalPost.recipeId,
              likes_count: originalPost.likes || 0,
              comments_count: originalPost.comments || 0,
              created_at: originalPost.createdAt,
            },
      },
    };
  }

  return baseResponse;
}

/**
 * Fetch original posts for shared posts
 * Returns map of originalPostId -> original post data
 */
async function fetchOriginalPostsBatch(posts: any[]): Promise<Map<string, any>> {
  const originalPostMap = new Map<string, any>();

  // Get all shared posts that need original post data
  const sharedPosts = posts.filter((p) => p.postType === 'shared' && p.sharedPost?.originalPostId);
  if (sharedPosts.length === 0) return originalPostMap;

  const originalPostIds = [...new Set(sharedPosts.map((p) => p.sharedPost.originalPostId))];

  // Fetch original posts in parallel
  const promises = originalPostIds.map(async (postId) => {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: 'METADATA',
          },
        })
      );
      if (result.Item) {
        // Also fetch author info for original post
        const authorResult = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `USER#${result.Item.authorId}`,
              SK: 'PROFILE',
            },
          })
        );
        originalPostMap.set(postId, {
          ...result.Item,
          username: authorResult.Item?.username || result.Item.authorId,
          authorAvatar: authorResult.Item?.avatarUrl,
        });
      }
    } catch (error) {
      console.warn(`Failed to fetch original post ${postId}:`, error);
    }
  });

  await Promise.all(promises);
  return originalPostMap;
}

/**
 * Get personalized feed handler
 * GET /v1/feed
 */
export async function getPersonalizedFeed(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Debug: Log authorizer claims
    console.log(
      'Authorizer claims:',
      JSON.stringify(event.requestContext.authorizer?.claims || {})
    );

    const userId = getUserId(event);
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    // Use userId (Cognito sub) for querying posts - posts are stored with authorId = sub
    const result = await feedService.getPersonalizedFeed(userId, limit, lastKey);

    // Fetch user info, reactions, and original posts for shared posts in parallel
    const userIds = result.posts.map((p: any) => p.authorId).filter(Boolean);
    const postIds = result.posts.map((p: any) => p.postId).filter(Boolean);

    const [userInfoMap, userReactionsMap, originalPostsMap] = await Promise.all([
      fetchUserInfoBatch(userIds),
      fetchUserReactionsBatch(userId, postIds),
      fetchOriginalPostsBatch(result.posts),
    ]);

    // Transform posts to API response format with user info, reactions, and original post data
    const transformedPosts = result.posts.map((post: any) => {
      const userInfo = userInfoMap.get(post.authorId);
      const userReaction = userReactionsMap.get(post.postId);
      const originalPost =
        post.postType === 'shared' && post.sharedPost
          ? originalPostsMap.get(post.sharedPost.originalPostId)
          : undefined;
      return transformPostForResponse(post, userInfo, userReaction, originalPost);
    });

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      posts: transformedPosts,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting personalized feed:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get personalized feed',
    });
  }
}

/**
 * Get trending feed handler
 * GET /v1/feed/trending
 */
export async function getTrendingFeed(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await feedService.getTrendingFeed(userId, limit, lastKey);

    // Fetch user info, reactions, and original posts for shared posts in parallel
    const userIds = result.posts.map((p: any) => p.authorId).filter(Boolean);
    const postIds = result.posts.map((p: any) => p.postId).filter(Boolean);

    const [userInfoMap, userReactionsMap, originalPostsMap] = await Promise.all([
      fetchUserInfoBatch(userIds),
      fetchUserReactionsBatch(userId, postIds),
      fetchOriginalPostsBatch(result.posts),
    ]);

    // Transform posts to API response format with user info, reactions, and original post data
    const transformedPosts = result.posts.map((post: any) => {
      const userInfo = userInfoMap.get(post.authorId);
      const userReaction = userReactionsMap.get(post.postId);
      const originalPost =
        post.postType === 'shared' && post.sharedPost
          ? originalPostsMap.get(post.sharedPost.originalPostId)
          : undefined;
      return transformPostForResponse(post, userInfo, userReaction, originalPost);
    });

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      posts: transformedPosts,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting trending feed:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get trending feed',
    });
  }
}

/**
 * Get friends feed handler
 * GET /v1/feed/following
 */
export async function getFriendsFeed(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await feedService.getFriendsFeed(userId, limit, lastKey);

    // Fetch user info, reactions, and original posts for shared posts in parallel
    const userIds = result.posts.map((p: any) => p.authorId).filter(Boolean);
    const postIds = result.posts.map((p: any) => p.postId).filter(Boolean);

    const [userInfoMap, userReactionsMap, originalPostsMap] = await Promise.all([
      fetchUserInfoBatch(userIds),
      fetchUserReactionsBatch(userId, postIds),
      fetchOriginalPostsBatch(result.posts),
    ]);

    // Transform posts to API response format with user info, reactions, and original post data
    const transformedPosts = result.posts.map((post: any) => {
      const userInfo = userInfoMap.get(post.authorId);
      const userReaction = userReactionsMap.get(post.postId);
      const originalPost =
        post.postType === 'shared' && post.sharedPost
          ? originalPostsMap.get(post.sharedPost.originalPostId)
          : undefined;
      return transformPostForResponse(post, userInfo, userReaction, originalPost);
    });

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      posts: transformedPosts,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting friends feed:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get friends feed',
    });
  }
}

/**
 * Get discover feed handler (public posts)
 * GET /v1/feed/discover
 */
export async function getDiscoverFeed(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await feedService.getDiscoverFeed(userId, limit, lastKey);

    // Fetch user info, reactions, and original posts for shared posts in parallel
    const userIds = result.posts.map((p: any) => p.authorId).filter(Boolean);
    const postIds = result.posts.map((p: any) => p.postId).filter(Boolean);

    const [userInfoMap, userReactionsMap, originalPostsMap] = await Promise.all([
      fetchUserInfoBatch(userIds),
      fetchUserReactionsBatch(userId, postIds),
      fetchOriginalPostsBatch(result.posts),
    ]);

    // Transform posts to API response format with user info, reactions, and original post data
    const transformedPosts = result.posts.map((post: any) => {
      const userInfo = userInfoMap.get(post.authorId);
      const userReaction = userReactionsMap.get(post.postId);
      const originalPost =
        post.postType === 'shared' && post.sharedPost
          ? originalPostsMap.get(post.sharedPost.originalPostId)
          : undefined;
      return transformPostForResponse(post, userInfo, userReaction, originalPost);
    });

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      posts: transformedPosts,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting discover feed:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get discover feed',
    });
  }
}
