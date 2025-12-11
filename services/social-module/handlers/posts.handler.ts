/**
 * Post Handlers
 *
 * API handlers for post management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PostService } from '../services/post.service';
import {
  QuickPostData,
  RecipeShareData,
  PostUpdateData,
  SharePostData,
} from '../models/post.model';
import { checkRateLimit, RATE_LIMITS } from '../../../shared/utils/rate-limiter';

// S3 client for presigned URLs
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

const CONTENT_BUCKET = process.env.CONTENT_BUCKET || '';
const CDN_DOMAIN = process.env.CDN_DOMAIN || 'cdn-dev.everyonecook.cloud';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

// Lazy initialization - allows dependency injection for testing
let postService: PostService | null = null;

/**
 * Get or create PostService instance
 * Allows injection for testing while maintaining singleton for production
 */
export function getPostService(): PostService {
  if (!postService) {
    postService = new PostService();
  }
  return postService;
}

/**
 * Set PostService instance (for testing)
 */
export function setPostService(service: PostService): void {
  postService = service;
}

/**
 * Reset PostService instance (for testing)
 */
export function resetPostService(): void {
  postService = null;
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
 * Helper function to get user ID from event
 */
function getUserId(event: APIGatewayProxyEvent): string {
  // Log the authorizer structure for debugging
  console.log('Authorizer structure:', JSON.stringify(event.requestContext.authorizer, null, 2));

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    console.error(
      'User ID not found in authorizer claims. Full authorizer:',
      event.requestContext.authorizer
    );
    throw new Error('User not authenticated');
  }
  return userId;
}

/**
 * Create quick post handler
 * POST /v1/posts
 *
 * Flow 1: Đăng bài trực tiếp trên Social
 * - title/content: Tiêu đề bài viết (required)
 * - images: Ảnh đính kèm (optional, max 3)
 *
 * Body (supports both formats):
 * - title OR content: string (required) - Post title/content
 * - images: string[] (optional) - Image URLs
 * - privacy OR privacyLevel: 'public' | 'friends' | 'private' (optional)
 */
export async function createQuickPost(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    // Check rate limit: 10 posts per 10 minutes
    const isRateLimited = await checkRateLimit(userId, RATE_LIMITS.POST_CREATE);
    if (isRateLimited) {
      return createResponse(429, {
        error: 'Bạn đã đăng quá nhiều bài. Vui lòng thử lại sau 10 phút.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    const body = JSON.parse(event.body || '{}');

    // Support both field names for backward compatibility
    const title = body.title || body.content;
    const images = body.images || [];
    const tempImageKeys = body.tempImageKeys || []; // S3 temp keys for move
    const privacyLevel = body.privacyLevel || body.privacy || 'public';

    // Validate required fields - title is required
    if (!title || !title.trim()) {
      return createResponse(400, {
        error: 'Tiêu đề bài đăng là bắt buộc',
      });
    }

    // Images are optional, but max 5
    const imageCount = tempImageKeys.length || images.length;
    if (imageCount > 5) {
      return createResponse(400, {
        error: 'Tối đa 5 ảnh cho mỗi bài đăng',
      });
    }

    const data: QuickPostData = {
      title: title.trim(),
      caption: body.caption || '',
      images: images,
      tempImageKeys: tempImageKeys, // Pass temp keys for backend to move
      privacyLevel: privacyLevel,
      tags: body.tags || [],
    };

    const post = await getPostService().createQuickPost(userId, data);

    return createResponse(201, {
      message: 'Đã tạo bài đăng thành công',
      post,
    });
  } catch (error: any) {
    console.error('Error creating quick post:', error);
    return createResponse(500, {
      error: error.message || 'Không thể tạo bài đăng',
    });
  }
}

/**
 * Share recipe as post handler
 * POST /v1/posts/share-recipe
 *
 * Flow 2: Share từ Recipe Management
 * - COPY data từ recipe (không reference)
 * - Post và Recipe độc lập sau khi share
 *
 * Body:
 * - recipeId: string (required)
 * - title: string (optional) - Custom title for post
 * - images: string[] (optional) - Custom images
 * - privacy: 'public' | 'friends' | 'private' (optional)
 */
export async function shareRecipeAsPost(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Use Cognito sub as authorId for consistency with createQuickPost
    const userId = getUserId(event);

    // Check rate limit: 10 posts per 10 minutes
    const isRateLimited = await checkRateLimit(userId, RATE_LIMITS.POST_CREATE);
    if (isRateLimited) {
      return createResponse(429, {
        error: 'Bạn đã đăng quá nhiều bài. Vui lòng thử lại sau 10 phút.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    const body = JSON.parse(event.body || '{}');
    const { recipeId, title, content, images, privacy } = body;

    // Validate required fields
    if (!recipeId) {
      return createResponse(400, {
        error: 'Thiếu recipeId',
      });
    }

    // Create post with recipe data (COPY, not reference)
    const data: RecipeShareData = {
      recipeId,
      title: title || content || undefined, // Support both title and legacy content field
      images: images || [],
      privacyLevel: privacy || 'public',
    };

    const post = await getPostService().shareRecipeAsPost(userId, data);

    return createResponse(201, {
      message: 'Đã chia sẻ công thức thành công',
      post,
    });
  } catch (error: any) {
    console.error('Error sharing recipe:', error);

    if (error.message === 'Recipe not found') {
      return createResponse(404, {
        error: 'Không tìm thấy công thức',
      });
    }

    return createResponse(500, {
      error: error.message || 'Không thể chia sẻ công thức',
    });
  }
}

/**
 * Share post handler (like Facebook share)
 * POST /v1/posts/:postId/share
 *
 * Creates a NEW post with reference to original post:
 * - postType: 'shared'
 * - sharedPost: contains reference to original post
 * - Original post data is NOT copied (only referenced)
 * - If original post is deleted, shared post shows "Post không khả dụng"
 *
 * Body:
 * - caption: string (optional) - Sharer's own caption/comment
 * - privacy: 'public' | 'friends' | 'private' (optional)
 */
export async function sharePost(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    // Check rate limit: 10 posts per 10 minutes
    const isRateLimited = await checkRateLimit(userId, RATE_LIMITS.POST_CREATE);
    if (isRateLimited) {
      return createResponse(429, {
        error: 'Bạn đã đăng quá nhiều bài. Vui lòng thử lại sau 10 phút.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    const originalPostId = event.pathParameters?.postId;

    if (!originalPostId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    const body = JSON.parse(event.body || '{}');
    const { caption, share_caption, privacy, privacyLevel } = body;

    const data: SharePostData = {
      originalPostId,
      caption: caption || share_caption || '',
      privacyLevel: privacy || privacyLevel || 'public',
    };

    const post = await getPostService().sharePost(userId, data);

    // Get sharer's info for response
    let sharerUsername = userId;
    let sharerAvatar: string | undefined;
    try {
      const userResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
          },
        })
      );
      if (userResult.Item) {
        sharerUsername = userResult.Item.username || userResult.Item.fullName || userId;
        sharerAvatar = userResult.Item.avatarUrl;
      }
    } catch (error) {
      console.warn('Failed to fetch sharer info:', error);
    }

    return createResponse(201, {
      message: 'Đã chia sẻ bài viết thành công',
      post: {
        post_id: post.postId,
        postId: post.postId,
        user_id: post.authorId,
        authorId: post.authorId,
        username: sharerUsername,
        user_avatar: sharerAvatar,
        content: post.title,
        caption: post.caption,
        images: [],
        postType: 'shared',
        privacy: post.privacyLevel,
        privacyLevel: post.privacyLevel,
        likes_count: 0,
        comments_count: 0,
        created_at: post.createdAt,
        createdAt: post.createdAt,
        sharedPost: post.sharedPost,
      },
    });
  } catch (error: any) {
    console.error('Error sharing post:', error);

    if (error.message === 'Original post not found') {
      return createResponse(404, {
        error: 'Không tìm thấy bài viết gốc',
      });
    }

    if (error.message === 'You cannot share your own post') {
      return createResponse(400, {
        error: 'Bạn không thể chia sẻ bài viết của chính mình',
      });
    }

    if (error.message === 'You can only share public posts') {
      return createResponse(403, {
        error: 'Bạn chỉ có thể chia sẻ bài viết công khai',
      });
    }

    return createResponse(500, {
      error: error.message || 'Không thể chia sẻ bài viết',
    });
  }
}

/**
 * Get post by ID handler
 * GET /v1/posts/:postId
 *
 * Privacy check:
 * - Public posts: anyone can view
 * - Friends posts: only author and friends can view
 * - Private posts: only author can view
 */
export async function getPost(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const postId = event.pathParameters?.postId;
    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    // Get viewer ID for privacy check (optional - unauthenticated users can view public posts)
    let viewerId: string | undefined;
    try {
      viewerId = getUserId(event);
    } catch {
      // User not authenticated - can only view public posts
      viewerId = undefined;
    }

    // Get post with privacy check
    const post = await getPostService().getPost(postId, viewerId);

    if (!post) {
      // Post not found OR user doesn't have permission to view
      // Return generic error to avoid leaking information about post existence
      return createResponse(404, {
        error: 'Bài viết không tồn tại hoặc bạn không có quyền xem',
        code: 'POST_NOT_ACCESSIBLE',
      });
    }

    // For shared posts, fetch original post data
    let originalPostData: any = null;
    if (post.postType === 'shared' && post.sharedPost?.originalPostId) {
      try {
        // Also check privacy for original post
        const originalPost = await getPostService().getPost(
          post.sharedPost.originalPostId,
          viewerId
        );
        if (originalPost) {
          // Also fetch original author info
          const authorResult = await docClient.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: {
                PK: `USER#${originalPost.authorId}`,
                SK: 'PROFILE',
              },
            })
          );
          originalPostData = {
            ...originalPost,
            username: authorResult.Item?.username || originalPost.authorId,
            authorAvatar: authorResult.Item?.avatarUrl,
          };
        }
      } catch (error) {
        console.warn('Failed to fetch original post:', error);
      }
    }

    // Fetch user info and user's reaction for this post
    const [userInfo, userReactionsMap] = await Promise.all([
      fetchUserInfoBatch([post.authorId]),
      viewerId ? fetchUserReactionsBatch(viewerId, [post.postId]) : Promise.resolve(new Map()),
    ]);

    // Get user's reaction for this post
    const userReaction = viewerId ? userReactionsMap.get(post.postId) : undefined;

    // Transform post for response
    const transformedPost = transformPostForResponse(
      post,
      userInfo.get(post.authorId),
      userReaction,
      originalPostData
    );

    return createResponse(200, {
      post: transformedPost,
    });
  } catch (error: any) {
    console.error('Error getting post:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get post',
    });
  }
}

/**
 * Update post handler
 * PUT /v1/posts/:postId
 *
 * Edit restrictions:
 * - Owner can only edit TITLE (not caption, images, recipe data)
 * - Privacy level can be changed
 *
 * Body:
 * - title: string (optional) - New title for the post
 * - privacyLevel: 'public' | 'friends' | 'private' (optional)
 */
export async function updatePost(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    const body = JSON.parse(event.body || '{}');

    // Only allow title and privacyLevel updates
    const data: PostUpdateData = {
      title: body.title,
      privacyLevel: body.privacyLevel,
    };

    // Validate at least one field to update
    if (data.title === undefined && data.privacyLevel === undefined) {
      return createResponse(400, {
        error: 'Chỉ có thể chỉnh sửa tiêu đề hoặc quyền riêng tư',
      });
    }

    const post = await getPostService().updatePost(postId, userId, data);

    return createResponse(200, {
      message: 'Post updated successfully',
      post,
    });
  } catch (error: any) {
    console.error('Error updating post:', error);

    if (error.message === 'Post not found') {
      return createResponse(404, {
        error: 'Không tìm thấy bài đăng',
      });
    }

    if (error.message === 'You can only update your own posts') {
      return createResponse(403, {
        error: 'Bạn chỉ có thể chỉnh sửa bài đăng của mình',
      });
    }

    if (error.message === 'Title cannot be empty') {
      return createResponse(400, {
        error: 'Tiêu đề không được để trống',
      });
    }

    if (error.message.includes('No valid fields')) {
      return createResponse(400, {
        error: 'Chỉ có thể chỉnh sửa tiêu đề hoặc quyền riêng tư',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to update post',
    });
  }
}

/**
 * Delete post handler
 * DELETE /v1/posts/:postId
 */
export async function deletePost(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    await getPostService().deletePost(postId, userId);

    return createResponse(200, {
      message: 'Post deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting post:', error);

    if (error.message === 'Post not found') {
      return createResponse(404, {
        error: 'Post not found',
      });
    }

    if (error.message === 'You can only delete your own posts') {
      return createResponse(403, {
        error: 'You can only delete your own posts',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to delete post',
    });
  }
}

/**
 * Get user feed handler
 * GET /v1/posts
 */
export async function getUserFeed(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await getPostService().getUserFeed(userId, limit, lastKey);

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      posts: result.posts,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting user feed:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get user feed',
    });
  }
}

/**
 * Fetch user info for multiple user IDs
 */
async function fetchUserInfoBatch(
  userIds: string[]
): Promise<Map<string, { username: string; avatarUrl?: string }>> {
  const userMap = new Map<string, { username: string; avatarUrl?: string }>();
  if (userIds.length === 0) return userMap;

  const uniqueUserIds = [...new Set(userIds)];
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
              Keys: batch.map((userId) => ({ PK: `USER#${userId}`, SK: 'PROFILE' })),
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
 * Fetch user's reactions for posts
 */
async function fetchUserReactionsBatch(
  userId: string,
  postIds: string[]
): Promise<Map<string, string>> {
  const reactionMap = new Map<string, string>();
  if (!userId || postIds.length === 0) return reactionMap;

  const uniquePostIds = [...new Set(postIds)];
  const batchSize = 25;

  for (let i = 0; i < uniquePostIds.length; i += batchSize) {
    const batch = uniquePostIds.slice(i, i + batchSize);
    const promises = batch.map(async (postId) => {
      try {
        const result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `POST#${postId}`, SK: `REACTION#${userId}` },
            ProjectionExpression: 'reactionType',
          })
        );
        if (result.Item?.reactionType) {
          reactionMap.set(postId, result.Item.reactionType);
        }
      } catch (error) {
        /* ignore */
      }
    });
    await Promise.all(promises);
  }
  return reactionMap;
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
 * Transform post for API response with user info
 */
function transformPostForResponse(
  post: any,
  userInfo?: { username?: string; avatarUrl?: string },
  userReaction?: string,
  originalPostData?: any // For shared posts - the original post data
): any {
  const baseResponse = {
    post_id: post.postId,
    user_id: post.authorId,
    username: userInfo?.username || post.authorUsername || post.authorId,
    user_avatar: userInfo?.avatarUrl || post.authorAvatar,
    content: post.title,
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
    user_reaction: userReaction,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    // Include recipe data if available - use embedded recipeData if exists
    recipeData:
      post.postType === 'recipe_share'
        ? post.recipeData
          ? {
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

    // If original post data is provided (fetched), use it
    // Otherwise, use the snapshot stored in sharedPost
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
        // Original post data (live or snapshot)
        originalPost: isOriginalDeleted
          ? {
              // Use snapshot if original is deleted
              isDeleted: true,
              title: sharedPostRef.snapshot?.title || 'Bài viết không khả dụng',
              content: sharedPostRef.snapshot?.content,
              images: sharedPostRef.snapshot?.images || [],
              recipeData: sharedPostRef.snapshot?.recipeData,
              postType: sharedPostRef.snapshot?.postType,
            }
          : {
              // Use live data from original post
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
 * Get posts by user ID handler
 * GET /v1/users/:userId/posts
 */
export async function getUserPosts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let viewerId: string;
    try {
      viewerId = getUserId(event);
    } catch (authError: any) {
      console.error('Authentication error in getUserPosts:', authError);
      return createResponse(401, {
        error: 'User not authenticated',
        message: authError.message || 'Missing or invalid authentication credentials',
      });
    }

    let targetUserId = event.pathParameters?.userId;
    if (!targetUserId) {
      const pathMatch = event.path.match(/\/users\/([^/]+)\/posts/);
      targetUserId = pathMatch ? pathMatch[1] : undefined;
    }

    if (!targetUserId) {
      return createResponse(400, { error: 'Missing userId parameter' });
    }

    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await getPostService().getUserPosts(targetUserId, viewerId, limit, lastKey);

    // Enrich posts with user info, reactions, and original posts for shared posts
    const userIds = result.posts.map((p: any) => p.authorId).filter(Boolean);
    const postIds = result.posts.map((p: any) => p.postId).filter(Boolean);

    const [userInfoMap, userReactionsMap, originalPostsMap] = await Promise.all([
      fetchUserInfoBatch(userIds),
      fetchUserReactionsBatch(viewerId, postIds),
      fetchOriginalPostsBatch(result.posts),
    ]);

    const transformedPosts = result.posts.map((post: any) => {
      const userInfo = userInfoMap.get(post.authorId);
      const userReaction = userReactionsMap.get(post.postId);
      const originalPost =
        post.postType === 'shared' && post.sharedPost
          ? originalPostsMap.get(post.sharedPost.originalPostId)
          : undefined;
      return transformPostForResponse(post, userInfo, userReaction, originalPost);
    });

    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      posts: transformedPosts,
      nextToken: encodedToken,
      lastKey: encodedToken,
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting user posts:', error);
    return createResponse(500, { error: error.message || 'Failed to get user posts' });
  }
}

/**
 * Save recipe from post handler
 * POST /v1/posts/:postId/save-recipe
 *
 * Key behavior:
 * - Only RECIPE DATA is saved (ingredients, steps, nutrition, etc.)
 * - Post TITLE is NOT saved - user can provide custom title
 * - Images are COPIED to user's recipe folder (independent)
 * - Attribution is stored for credit
 *
 * Body (optional):
 * - customTitle: string - Custom title for the saved recipe
 */
export async function saveRecipeFromPost(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Use userId (Cognito sub) for GSI1PK consistency with manageRecipe
    const userId = getUserId(event);
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    // Parse optional body for customTitle
    const body = event.body ? JSON.parse(event.body) : {};
    const customTitle = body.customTitle;

    const result = await getPostService().saveRecipeFromPost(postId, userId, customTitle);

    return createResponse(201, {
      message: 'Recipe saved successfully',
      recipe: result,
    });
  } catch (error: any) {
    console.error('Error saving recipe from post:', error);

    if (error.message === 'Post not found') {
      return createResponse(404, {
        error: 'Post not found',
      });
    }

    if (error.message === 'Post is not a recipe share') {
      return createResponse(400, {
        error: 'Chỉ có thể lưu công thức từ bài đăng chia sẻ món ăn',
      });
    }

    if (error.message === 'You do not have permission to view this post') {
      return createResponse(403, {
        error: 'Bạn không có quyền xem bài đăng này',
      });
    }

    if (error.message === 'Recipe data not found in post') {
      return createResponse(400, {
        error: 'Không tìm thấy dữ liệu công thức trong bài đăng',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to save recipe from post',
    });
  }
}

/**
 * Get presigned URL for post image upload
 * POST /posts/upload-image
 *
 * Upload Flow:
 * 1. Frontend requests presigned URL → uploads to posts/temp/{userId}/
 * 2. When post is created → backend moves images to posts/{userId}/
 * 3. If post fails or user cancels → S3 lifecycle auto-deletes temp files after 24h
 *
 * Body:
 * - fileName: string (required) - Original file name
 * - contentType: string (required) - File MIME type (image/jpeg, image/png, image/webp)
 * - fileSize: number (required) - File size in bytes
 *
 * Returns:
 * - uploadUrl: Presigned S3 URL for PUT upload
 * - tempKey: S3 key in temp folder (for backend to move later)
 * - imageUrl: Final CDN URL (after post is created)
 */
export async function getPostImageUploadUrl(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const body = JSON.parse(event.body || '{}');

    const { fileName, contentType, fileSize, file_name, file_type, file_size } = body;

    // Support both camelCase and snake_case
    const finalFileName = fileName || file_name;
    const finalContentType = contentType || file_type;
    const finalFileSize = fileSize || file_size;

    // Validate required fields
    if (!finalFileName || !finalContentType || !finalFileSize) {
      return createResponse(400, {
        error: 'Missing required fields: fileName, contentType, fileSize',
      });
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(finalContentType)) {
      return createResponse(400, {
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (finalFileSize > maxSize) {
      return createResponse(400, {
        error: 'File size exceeds maximum allowed size of 5 MB',
      });
    }

    // Generate unique file key in TEMP folder
    // S3 lifecycle will auto-delete files in posts/temp/ after 24h
    const timestamp = Date.now();
    const extension = finalFileName.split('.').pop() || 'jpg';
    const sanitizedName = finalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempKey = `posts/temp/${userId}/${sanitizedName}-${timestamp}.${extension}`;

    // Final key (where image will be moved after post is created)
    const finalKey = `posts/${userId}/${sanitizedName}-${timestamp}.${extension}`;

    // Generate presigned URL for temp location
    const command = new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: tempKey,
      ContentType: finalContentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

    // Return both temp key and final CDN URL
    // Frontend will upload to temp, backend will move to final when post is created
    const imageUrl = `https://${CDN_DOMAIN}/${finalKey}`;

    console.log(
      '[getPostImageUploadUrl] Generated presigned URL for user:',
      userId,
      'tempKey:',
      tempKey
    );

    return createResponse(200, {
      uploadUrl,
      tempKey, // S3 key in temp folder
      imageUrl, // Final CDN URL (after move)
      expiresIn: 300,
    });
  } catch (error: any) {
    console.error('Error generating post image upload URL:', error);
    return createResponse(500, {
      error: error.message || 'Failed to generate upload URL',
    });
  }
}

/**
 * Get stats for multiple posts (lightweight endpoint for polling)
 * POST /v1/posts/stats
 *
 * Request body: { postIds: string[] }
 * Response: { stats: { [postId]: { likes_count, comments_count } } }
 *
 * This endpoint is optimized for frequent polling:
 * - Only returns counts, not full post data
 * - Batch fetches for efficiency
 * - No user info enrichment needed
 */
export async function getPostsStats(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Auth is optional for this endpoint (public posts stats are public)
    let userId: string | null = null;
    try {
      userId = getUserId(event);
    } catch {
      // Anonymous access allowed
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const postIds: string[] = body.postIds || [];

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return createResponse(400, { error: 'postIds array is required' });
    }

    // Limit to 50 posts per request
    if (postIds.length > 50) {
      return createResponse(400, { error: 'Maximum 50 posts per request' });
    }

    // Batch fetch post stats
    const stats: Record<
      string,
      { likes_count: number; comments_count: number; user_reaction?: string }
    > = {};
    const uniquePostIds = [...new Set(postIds)];
    const batchSize = 25;

    for (let i = 0; i < uniquePostIds.length; i += batchSize) {
      const batch = uniquePostIds.slice(i, i + batchSize);

      // Fetch post metadata in parallel
      const promises = batch.map(async (postId) => {
        try {
          const result = await docClient.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: { PK: `POST#${postId}`, SK: 'METADATA' },
              ProjectionExpression: 'postId, likes, comments',
            })
          );

          if (result.Item) {
            stats[postId] = {
              likes_count: result.Item.likes || 0,
              comments_count: result.Item.comments || 0,
            };
          }
        } catch (error) {
          console.warn(`Failed to fetch stats for post ${postId}:`, error);
        }
      });

      await Promise.all(promises);
    }

    // If user is authenticated, also fetch their reactions
    if (userId) {
      const reactionMap = await fetchUserReactionsBatch(userId, uniquePostIds);
      reactionMap.forEach((reaction, postId) => {
        if (stats[postId]) {
          stats[postId].user_reaction = reaction;
        }
      });
    }

    return createResponse(200, { stats });
  } catch (error: any) {
    console.error('Error getting posts stats:', error);
    return createResponse(500, { error: error.message || 'Failed to get posts stats' });
  }
}
