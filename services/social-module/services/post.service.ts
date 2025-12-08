/**
 * Post Service
 *
 * Business logic for post management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import {
  Post,
  PostImages,
  QuickPostData,
  RecipeShareData,
  PostUpdateData,
  Recipe,
  IngredientIndex,
  EmbeddedRecipeData,
  RecipeStep,
  SharePostData,
  SharedPostReference,
} from '../models/post.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true, // Remove undefined values from objects
  },
});
const s3Client = new S3Client({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const CONTENT_BUCKET = process.env.CONTENT_BUCKET || 'everyonecook-content-dev';
const CDN_DOMAIN = process.env.CDN_DOMAIN || 'cdn-dev.everyonecook.cloud';

/**
 * Post Service Class
 */
export class PostService {
  /**
   * Create a quick post (direct feed post)
   *
   * Flow 1: Đăng bài trực tiếp trên Social
   * - title: Tiêu đề bài viết (bắt buộc nếu có images)
   * - images: Ảnh đính kèm (optional, max 3)
   * - Validation: Nếu có images thì bắt buộc phải có title
   *
   * Image Upload Flow:
   * 1. Frontend uploads to posts/temp/{userId}/ via presigned URL
   * 2. Frontend sends tempImageKeys to backend
   * 3. Backend moves images to posts/{userId}/ when post is created
   * 4. If post fails, S3 lifecycle auto-deletes temp files after 24h
   */
  async createQuickPost(userId: string, data: QuickPostData): Promise<Post> {
    // 1. Validate: Title is required
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('Title is required for posts');
    }

    // 2. Validate: If images exist, title is required (already checked above)
    const hasTempImages = data.tempImageKeys && data.tempImageKeys.length > 0;
    const hasImages = data.images && data.images.length > 0;

    // 3. Validate image count (max 3)
    if (hasTempImages && data.tempImageKeys!.length > 3) {
      throw new Error('Quick posts can have maximum 3 images');
    }

    // 4. Generate post ID
    const postId = uuidv4();

    // 5. Move images from temp to permanent location if tempImageKeys provided
    let imageUrls: string[] = [];
    if (hasTempImages) {
      imageUrls = await this.moveImagesToPermament(data.tempImageKeys!, userId);
      console.log('[PostService] Moved images from temp to permanent:', imageUrls);
    } else if (hasImages) {
      // Fallback: use provided image URLs directly (legacy support)
      imageUrls = data.images!;
    }

    // 6. Create post entity
    const now = new Date().toISOString();

    // Generate searchable text (lowercase for search)
    const searchableText = `${data.title} ${data.caption || ''}`.toLowerCase();

    const post: Post = {
      PK: `POST#${postId}`,
      SK: 'METADATA',
      postId,
      authorId: userId,
      postType: 'quick',
      title: data.title.trim(),
      caption: data.caption?.trim() || '',
      images: {
        type: 'quick',
        quickImages: imageUrls,
      },
      privacyLevel: data.privacyLevel || 'public',
      tags: data.tags || [],
      searchableText,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      reportCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,

      // GSI2: Public feed + text search fallback
      GSI2PK: data.privacyLevel === 'public' ? 'POST#PUBLIC' : `POST#${userId}`,
      GSI2SK: now,

      // GSI3: Trending posts (sorted by likes)
      GSI3PK: 'POST#TRENDING',
      GSI3SK: `00000#${now}`, // Pad likes to 5 digits for proper sorting
    };

    // 7. Save to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: post,
      })
    );

    return post;
  }

  /**
   * Share recipe as post
   *
   * Flow 2: Share từ Recipe Management
   * - COPY data từ recipe (không reference)
   * - Post và Recipe độc lập sau khi share
   * - Xóa post không ảnh hưởng recipe và ngược lại
   * - title có thể custom (khác với recipe title)
   */
  async shareRecipeAsPost(userId: string, data: RecipeShareData): Promise<Post> {
    // 1. Get recipe from Manager Recipe
    // Recipe is stored with PK: RECIPE#{recipeId}, SK: METADATA
    const recipeResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `RECIPE#${data.recipeId}`,
          SK: 'METADATA',
        },
      })
    );

    if (!recipeResult.Item) {
      throw new Error('Recipe not found');
    }

    // Verify the recipe belongs to the user (GSI1PK contains USER#{userId})
    const recipe = recipeResult.Item as any;
    if (recipe.GSI1PK !== `USER#${userId}`) {
      throw new Error('You can only share your own recipes');
    }

    // Check if this is a recipe saved from social (has attribution)
    // If so, we'll include the original author info in the post
    const isFromSocial = recipe.source === 'saved' || recipe.source === 'imported';
    const originalAttribution = isFromSocial ? recipe.attribution : undefined;

    // 2. Generate post ID
    const postId = uuidv4();

    // 3. Copy images from recipes/ to posts/ (independent copy)
    const copiedImages = await this.copyRecipeImages(recipe, postId);

    // 4. Use custom title or default to recipe title
    const postTitle = data.title?.trim() || recipe.title;

    // 5. Generate searchable text (lowercase for search)
    const normalizeIngredient = (ing: any): string => {
      if (typeof ing === 'string') return ing;
      return ing.normalized || ing.vietnamese || ing.english || ing.name || '';
    };

    const ingredientsText = (recipe.ingredients || [])
      .map(normalizeIngredient)
      .filter(Boolean)
      .join(' ');
    const searchableText = `${postTitle} ${data.caption || ''} ${ingredientsText}`.toLowerCase();

    // 6. Build embedded recipe data (FULL COPY of recipe)
    const now = new Date().toISOString();
    const normalizedIngredients = (recipe.ingredients || [])
      .map(normalizeIngredient)
      .filter(Boolean);

    // Build embedded recipe data with full steps
    const embeddedRecipeData: EmbeddedRecipeData = {
      title: recipe.title,
      description: recipe.description,
      ingredients: (recipe.ingredients || []).map((ing: any) => {
        if (typeof ing === 'string') {
          return { vietnamese: ing };
        }
        return {
          vietnamese: ing.vietnamese || ing.name || ing.normalized || '',
          english: ing.english,
          amount: ing.amount,
          notes: ing.notes,
        };
      }),
      steps: (recipe.steps || []).map(
        (step: any, index: number): RecipeStep => ({
          stepNumber: step.stepNumber || index + 1,
          description: step.description || step.instruction || '',
          images:
            copiedImages.recipeImages?.steps?.find(
              (s: any) => s.stepNumber === (step.stepNumber || index + 1)
            )?.images || [],
          duration: step.duration,
        })
      ),
      images: {
        completed: copiedImages.recipeImages?.completed || '',
      },
      servings: recipe.servings || 2,
      cookingTime: recipe.cookingTime || 30,
      difficulty: recipe.difficulty || 'medium',
      nutrition: recipe.nutrition,
    };

    // 7. Create post entity with FULL COPIED data
    const post: Post = {
      PK: `POST#${postId}`,
      SK: 'METADATA',
      postId,
      authorId: userId,
      postType: 'recipe_share',
      recipeId: data.recipeId, // Reference only, data is COPIED
      title: postTitle,
      caption: data.caption?.trim() || '',
      images: copiedImages,
      // Full embedded recipe data
      recipeData: embeddedRecipeData,
      // Legacy fields for search/compatibility
      ingredients: normalizedIngredients,
      servings: recipe.servings || 2,
      cookingTime: recipe.cookingTime || 30,
      difficulty: recipe.difficulty || 'medium',
      nutrition: recipe.nutrition || undefined,
      privacyLevel: data.privacyLevel || 'public',
      // Attribution for recipes saved from social (credit original author)
      recipeAttribution: originalAttribution
        ? {
            originalAuthorId: originalAttribution.originalAuthorId,
            originalAuthorUsername: originalAttribution.originalAuthorUsername,
            savedAt: originalAttribution.importedAt || originalAttribution.savedAt,
          }
        : undefined,
      tags: [],
      searchableText,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      importCount: 0,
      reportCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      GSI2PK: data.privacyLevel === 'public' ? 'POST#PUBLIC' : `POST#${userId}`,
      GSI2SK: now,
      GSI3PK: 'POST#TRENDING',
      GSI3SK: `00000#${now}`,
    };

    // 8. Save post to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: post,
      })
    );

    // 9. Create ingredient indexes for GSI4
    if (post.ingredients && post.ingredients.length > 0) {
      await this.createIngredientIndexes(postId, post.ingredients);
    }

    // 10. Update recipe with shared post link
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `RECIPE#${data.recipeId}`,
            SK: 'METADATA',
          },
          UpdateExpression: 'SET isShared = :true, sharedPostId = :postId, sharedAt = :now',
          ExpressionAttributeValues: {
            ':true': true,
            ':postId': postId,
            ':now': now,
          },
        })
      );
    } catch (updateError) {
      console.warn('Failed to update recipe shared status:', updateError);
    }

    return post;
  }

  /**
   * Get a post by ID (enriched with author info)
   * @param postId - Post ID
   * @param viewerId - Optional viewer ID for privacy check
   */
  async getPost(
    postId: string,
    viewerId?: string
  ): Promise<(Post & { username?: string; authorAvatar?: string }) | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    const post = result.Item as Post;

    // Check privacy if viewerId is provided
    if (viewerId && post.authorId !== viewerId) {
      const canView = await this.canUserViewPost(post, viewerId);
      if (!canView) {
        return null; // Return null if user cannot view the post
      }
    }

    // Enrich with author info
    try {
      const userResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${post.authorId}`,
            SK: 'PROFILE',
          },
        })
      );

      if (userResult.Item) {
        return {
          ...post,
          username: userResult.Item.username || userResult.Item.fullName || 'Unknown',
          authorAvatar: userResult.Item.avatarUrl,
        };
      }
    } catch (error) {
      console.error('Error fetching author info:', error);
    }

    return post;
  }

  /**
   * Check if a user can view a post based on privacy settings
   * @param post - The post to check
   * @param viewerId - The user trying to view the post
   * @returns true if user can view, false otherwise
   */
  async canUserViewPost(post: Post, viewerId: string): Promise<boolean> {
    // Hidden posts cannot be viewed by anyone (including author)
    // Author can only view hidden posts via violations page
    if (post.status === 'hidden') {
      return false;
    }

    // Author can always view their own non-hidden posts
    if (post.authorId === viewerId) {
      return true;
    }

    // Public posts can be viewed by anyone
    if (post.privacyLevel === 'public') {
      return true;
    }

    // Private posts can only be viewed by author
    if (post.privacyLevel === 'private') {
      return false;
    }

    // Friends-only posts require friendship check
    if (post.privacyLevel === 'friends') {
      const areFriends = await this.checkFriendship(post.authorId, viewerId);
      return areFriends;
    }

    // Default: deny access for unknown privacy levels
    return false;
  }

  /**
   * Check if two users are friends
   * @param userId1 - First user ID
   * @param userId2 - Second user ID
   * @returns true if they are friends, false otherwise
   */
  private async checkFriendship(userId1: string, userId2: string): Promise<boolean> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId1}`,
            SK: `FRIEND#${userId2}`,
          },
        })
      );

      // Check if friendship exists and is accepted
      return result.Item?.status === 'accepted';
    } catch (error) {
      console.error('Error checking friendship:', error);
      return false;
    }
  }

  /**
   * Update a post
   *
   * Edit restrictions:
   * - Owner can only edit TITLE (not caption, images, recipe data)
   * - Privacy level can be changed
   * - Other fields are immutable after creation
   */
  async updatePost(postId: string, userId: string, data: PostUpdateData): Promise<Post> {
    // 1. Get existing post
    const existingPost = await this.getPost(postId);
    if (!existingPost) {
      throw new Error('Post not found');
    }

    // 2. Verify ownership
    if (existingPost.authorId !== userId) {
      throw new Error('You can only update your own posts');
    }

    // 3. Build update expression (only title and privacyLevel allowed)
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string> = {};

    // Only title can be edited
    if (data.title !== undefined) {
      if (!data.title.trim()) {
        throw new Error('Title cannot be empty');
      }
      updateExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = data.title.trim();
    }

    // Privacy level can be changed
    if (data.privacyLevel !== undefined) {
      updateExpressions.push('privacyLevel = :privacyLevel');
      expressionAttributeValues[':privacyLevel'] = data.privacyLevel;

      // Update GSI2PK based on privacy level
      updateExpressions.push('GSI2PK = :gsi2pk');
      expressionAttributeValues[':gsi2pk'] =
        data.privacyLevel === 'public' ? 'POST#PUBLIC' : `POST#${userId}`;
    }

    // No fields to update
    if (updateExpressions.length === 0) {
      throw new Error('No valid fields to update. Only title and privacy can be edited.');
    }

    // Always update updatedAt
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    // Update searchableText if title changed
    if (data.title !== undefined) {
      const newTitle = data.title.trim();
      const ingredientsText = existingPost.ingredients?.join(' ') || '';
      updateExpressions.push('searchableText = :searchableText');
      expressionAttributeValues[':searchableText'] =
        `${newTitle} ${existingPost.caption} ${ingredientsText}`.toLowerCase();
    }

    // 4. Update post
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    // 5. Return updated post
    const updatedPost = await this.getPost(postId);
    if (!updatedPost) {
      throw new Error('Failed to retrieve updated post');
    }

    return updatedPost;
  }

  /**
   * Delete a post
   */
  async deletePost(postId: string, userId: string): Promise<void> {
    // 1. Get existing post
    const post = await this.getPost(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // 2. Verify ownership
    if (post.authorId !== userId) {
      throw new Error('You can only delete your own posts');
    }

    // 3. Delete DynamoDB metadata
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
      })
    );

    // 4. Delete ingredient indexes (if recipe_share post)
    if (post.postType === 'recipe_share' && post.ingredients) {
      await this.deleteIngredientIndexes(postId, post.ingredients);
    }

    // 5. Update recipe metadata for data consistency
    if (post.postType === 'recipe_share' && post.recipeId) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `USER#${userId}`,
              SK: `RECIPE#${post.recipeId}`,
            },
            UpdateExpression: 'REMOVE isShared, sharedPostId, sharedAt',
            ConditionExpression: 'attribute_exists(PK) AND sharedPostId = :postId',
            ExpressionAttributeValues: {
              ':postId': postId,
            },
          })
        );
      } catch (error: unknown) {
        // Recipe might be deleted or sharedPostId doesn't match - acceptable
        if (error instanceof Error && error.name !== 'ConditionalCheckFailedException') {
          console.error('Failed to update recipe metadata', { error, postId });
        }
      }
    }

    // 6. Delete S3 images folder
    await this.deleteS3Folder(`posts/${postId}/`);
  }

  /**
   * Get user's feed (paginated)
   * @param _userId - User ID (reserved for future privacy filtering)
   */
  async getUserFeed(
    _userId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<{ posts: Post[]; lastKey?: Record<string, unknown> }> {
    // Query more posts than needed to account for hidden posts being filtered out
    const queryLimit = Math.min(limit * 2, 100);
    
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'POST#PUBLIC',
        },
        ScanIndexForward: false, // Sort by timestamp descending
        Limit: queryLimit,
        ExclusiveStartKey: lastKey,
      })
    );

    // Filter out hidden posts
    const allPosts = (result.Items || []) as Post[];
    const visiblePosts = allPosts.filter((post) => post.status !== 'hidden');

    return {
      posts: visiblePosts.slice(0, limit),
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get posts by specific user (paginated)
   * @param targetUserId - User ID whose posts to retrieve
   * @param viewerId - User ID viewing the posts (for privacy filtering)
   * @param limit - Maximum number of posts to return
   * @param lastKey - Pagination key
   */
  async getUserPosts(
    targetUserId: string,
    viewerId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<{ posts: Post[]; lastKey?: Record<string, unknown> }> {
    const isOwnProfile = targetUserId === viewerId;

    if (isOwnProfile) {
      // Own profile: Query ALL posts (public, friends, private) using GSI2
      // Posts with friends/private have GSI2PK = POST#{userId}
      // Posts with public have GSI2PK = POST#PUBLIC but authorId = userId

      // Query user's non-public posts
      const privatePostsResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `POST#${targetUserId}`,
          },
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey: lastKey,
        })
      );

      // Query user's public posts with pagination to ensure we get all posts
      // DynamoDB applies Limit BEFORE FilterExpression, so we need to paginate
      // to find all posts by this user among all public posts
      const publicPosts: Post[] = [];
      let publicPaginationKey: Record<string, unknown> | undefined = undefined;
      const maxIterations = 10; // Safety limit to prevent infinite loops
      let iterations = 0;
      let hasMorePublicPosts = true;

      while (hasMorePublicPosts && iterations < maxIterations && publicPosts.length < limit) {
        const publicQueryResult: QueryCommandOutput = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :pk',
            FilterExpression: 'authorId = :authorId',
            ExpressionAttributeValues: {
              ':pk': 'POST#PUBLIC',
              ':authorId': targetUserId,
            },
            ScanIndexForward: false,
            Limit: 100, // Scan more items per iteration to find user's posts
            ExclusiveStartKey: publicPaginationKey,
          })
        );

        publicPosts.push(...((publicQueryResult.Items || []) as Post[]));
        publicPaginationKey = publicQueryResult.LastEvaluatedKey;
        hasMorePublicPosts = !!publicPaginationKey;
        iterations++;
      }

      // Combine and sort by createdAt
      const allPosts = [...((privatePostsResult.Items || []) as Post[]), ...publicPosts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Deduplicate by postId (in case of overlap)
      const seen = new Set<string>();
      const uniquePosts = allPosts.filter((post) => {
        if (seen.has(post.postId)) return false;
        seen.add(post.postId);
        return true;
      });

      // Filter hidden posts - author also cannot see hidden posts in feed/profile
      // They can only view hidden posts via violations page
      const visiblePosts = uniquePosts.filter((post) => post.status !== 'hidden');

      return {
        posts: visiblePosts.slice(0, limit),
        lastKey: privatePostsResult.LastEvaluatedKey,
      };
    } else {
      // Other user's profile: Only show public posts
      // Need to paginate to find all posts by this user among all public posts
      const publicPosts: Post[] = [];
      let publicLastKey: Record<string, unknown> | undefined = lastKey;
      const maxIterations = 10; // Safety limit
      let iterations = 0;
      let hasMore = true;

      while (hasMore && iterations < maxIterations && publicPosts.length < limit) {
        const result = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :pk',
            FilterExpression: 'authorId = :authorId',
            ExpressionAttributeValues: {
              ':pk': 'POST#PUBLIC',
              ':authorId': targetUserId,
            },
            ScanIndexForward: false,
            Limit: 100, // Scan more items per iteration
            ExclusiveStartKey: publicLastKey,
          })
        );

        publicPosts.push(...((result.Items || []) as Post[]));
        publicLastKey = result.LastEvaluatedKey;
        hasMore = !!publicLastKey;
        iterations++;
      }

      // Filter out hidden posts - other users cannot see hidden posts
      const visiblePosts = publicPosts.filter((post) => post.status !== 'hidden');

      // TODO: Add friend-based privacy filtering for friends posts

      return {
        posts: visiblePosts.slice(0, limit),
        lastKey: publicLastKey,
      };
    }
  }

  /**
   * Copy recipe images to posts folder
   * Handles missing images gracefully - if source doesn't exist, skip it
   */
  private async copyRecipeImages(recipe: Recipe, postId: string): Promise<PostImages> {
    const copiedImages: PostImages = {
      type: 'recipe',
      recipeImages: {
        completed: '',
        steps: [],
      },
    };

    // Copy completed dish image (thumbnail)
    if (recipe.images?.completed) {
      try {
        // Handle both CDN URL and S3 key formats
        let sourceKey = recipe.images.completed;
        if (sourceKey.startsWith('https://')) {
          // Extract key from CDN URL
          sourceKey = sourceKey.replace(`https://${CDN_DOMAIN}/`, '');
        }
        const destKey = `posts/${postId}/recipe-completed.jpg`;

        await s3Client.send(
          new CopyObjectCommand({
            Bucket: CONTENT_BUCKET,
            CopySource: `${CONTENT_BUCKET}/${sourceKey}`,
            Key: destKey,
          })
        );

        copiedImages.recipeImages!.completed = `https://${CDN_DOMAIN}/${destKey}`;
      } catch (error: any) {
        // Log but don't fail - image might not exist
        console.warn('Failed to copy completed image:', error.message);
        // Keep original URL as fallback
        copiedImages.recipeImages!.completed = recipe.images.completed;
      }
    }

    // Copy step images from recipe.steps[].images (preferred) or recipe.images.steps (legacy)
    // Priority: recipe.steps[].images > recipe.images.steps
    const steps = recipe.steps || [];

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex] as any;
      const stepNumber = step.stepNumber || stepIndex + 1;

      // Get step images from step.images (new format) or recipe.images.steps[stepIndex] (legacy)
      let stepImages: string[] = [];
      if (step.images && Array.isArray(step.images) && step.images.length > 0) {
        // New format: images stored in each step
        stepImages = step.images;
      } else if (
        recipe.images?.steps &&
        Array.isArray(recipe.images.steps[stepIndex]) &&
        (recipe.images.steps[stepIndex] as any).length > 0
      ) {
        // Legacy format: images stored in recipe.images.steps array
        stepImages = recipe.images.steps[stepIndex] as any;
      }

      if (stepImages.length === 0) continue;

      const copiedStepImages: string[] = [];

      for (let imgIndex = 0; imgIndex < Math.min(stepImages.length, 3); imgIndex++) {
        try {
          let sourceKey = stepImages[imgIndex];
          if (sourceKey.startsWith('https://')) {
            sourceKey = sourceKey.replace(`https://${CDN_DOMAIN}/`, '');
          }
          const destKey = `posts/${postId}/recipe-step-${stepNumber}-${imgIndex + 1}.jpg`;

          await s3Client.send(
            new CopyObjectCommand({
              Bucket: CONTENT_BUCKET,
              CopySource: `${CONTENT_BUCKET}/${sourceKey}`,
              Key: destKey,
            })
          );

          copiedStepImages.push(`https://${CDN_DOMAIN}/${destKey}`);
        } catch (error: any) {
          // Log but don't fail - keep original URL
          console.warn(`Failed to copy step ${stepNumber} image ${imgIndex + 1}:`, error.message);
          copiedStepImages.push(stepImages[imgIndex]);
        }
      }

      if (copiedStepImages.length > 0) {
        copiedImages.recipeImages!.steps.push({
          stepNumber,
          images: copiedStepImages,
        });
      }
    }

    return copiedImages;
  }

  /**
   * Create ingredient indexes for search
   */
  private async createIngredientIndexes(postId: string, ingredients: string[]): Promise<void> {
    const uniqueIngredients = [...new Set(ingredients)];

    for (const ingredient of uniqueIngredients) {
      const index: IngredientIndex = {
        PK: `POST#${postId}`,
        SK: `INGREDIENT#${ingredient}`,
        ingredientName: ingredient,
        GSI4PK: `POST_INGREDIENT#${ingredient}`,
        GSI4SK: `POST#${postId}`,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: index,
        })
      );
    }
  }

  /**
   * Delete ingredient indexes
   */
  private async deleteIngredientIndexes(postId: string, ingredients: string[]): Promise<void> {
    const uniqueIngredients = [...new Set(ingredients)];

    for (const ingredient of uniqueIngredients) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: `INGREDIENT#${ingredient}`,
          },
        })
      );
    }
  }

  /**
   * Delete S3 folder
   */
  private async deleteS3Folder(prefix: string): Promise<void> {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: CONTENT_BUCKET,
        Prefix: prefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return;
    }

    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: CONTENT_BUCKET,
        Delete: {
          Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key! })),
        },
      })
    );
  }

  /**
   * Share a post (like Facebook share)
   *
   * Creates a NEW post with reference to original post:
   * - postType: 'shared'
   * - sharedPost: contains reference to original post
   * - Original post data is NOT copied (only referenced)
   * - If original post is deleted, shared post shows "Post không khả dụng"
   *
   * @param userId - User ID sharing the post
   * @param data - Share post data
   * @returns Created shared post
   */
  async sharePost(userId: string, data: SharePostData): Promise<Post> {
    // 1. Get original post
    const originalPost = await this.getPost(data.originalPostId);
    if (!originalPost) {
      throw new Error('Original post not found');
    }

    // 2. Check if user is trying to share their own post
    if (originalPost.authorId === userId) {
      throw new Error('You cannot share your own post');
    }

    // 3. Check privacy - can only share public posts
    if (originalPost.privacyLevel !== 'public') {
      throw new Error('You can only share public posts');
    }

    // 4. Get original author info
    let originalAuthorUsername = originalPost.username || 'Unknown';
    let originalAuthorAvatar = originalPost.authorAvatar;

    try {
      const authorResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${originalPost.authorId}`,
            SK: 'PROFILE',
          },
        })
      );
      if (authorResult.Item) {
        originalAuthorUsername =
          authorResult.Item.username || authorResult.Item.fullName || 'Unknown';
        originalAuthorAvatar = authorResult.Item.avatarUrl;
      }
    } catch (error) {
      console.warn('Failed to fetch original author info:', error);
    }

    // 5. Generate new post ID
    const postId = uuidv4();
    const now = new Date().toISOString();

    // 6. Create snapshot of original post (for display if original deleted)
    const snapshot: SharedPostReference['snapshot'] = {
      title: originalPost.title,
      content: originalPost.caption,
      images: originalPost.images?.quickImages || [],
      recipeData: originalPost.recipeData,
      postType: originalPost.postType,
    };

    // 7. Create shared post reference
    const sharedPostRef: SharedPostReference = {
      originalPostId: data.originalPostId,
      originalAuthorId: originalPost.authorId,
      originalAuthorUsername,
      originalAuthorAvatar,
      snapshot,
      sharedAt: now,
    };

    // 8. Create shared post entity
    const post: Post = {
      PK: `POST#${postId}`,
      SK: 'METADATA',
      postId,
      authorId: userId,
      postType: 'shared',
      title: data.caption?.trim() || '', // Sharer's caption
      caption: data.caption?.trim() || '',
      images: { type: 'quick', quickImages: [] }, // Shared posts don't have their own images
      sharedPost: sharedPostRef,
      privacyLevel: data.privacyLevel || 'public',
      tags: [],
      searchableText: `${data.caption || ''} shared`.toLowerCase(),
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      reportCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      GSI2PK: data.privacyLevel === 'public' ? 'POST#PUBLIC' : `POST#${userId}`,
      GSI2SK: now,
      GSI3PK: 'POST#TRENDING',
      GSI3SK: `00000#${now}`,
    };

    // 9. Save to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: post,
      })
    );

    // 10. Update original post's share count
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${data.originalPostId}`,
            SK: 'METADATA',
          },
          UpdateExpression: 'ADD shares :inc',
          ExpressionAttributeValues: {
            ':inc': 1,
          },
        })
      );
    } catch (error) {
      console.warn('Failed to update original post share count:', error);
    }

    // 11. Send notification to original post author
    await this.sendShareNotification(userId, originalPost.authorId, data.originalPostId, postId);

    console.log('Post shared successfully', {
      sharedPostId: postId,
      originalPostId: data.originalPostId,
      sharedBy: userId,
    });

    return post;
  }

  /**
   * Send notification when someone shares a post
   * @param sharerId - User who shared the post
   * @param authorId - Original post author
   * @param originalPostId - Original post ID
   * @param sharedPostId - New shared post ID
   */
  private async sendShareNotification(
    sharerId: string,
    authorId: string,
    originalPostId: string,
    sharedPostId: string
  ): Promise<void> {
    // Don't notify if user shares their own post (shouldn't happen, but safety check)
    if (authorId === sharerId) {
      return;
    }

    const notificationId = uuidv4();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${authorId}`,
            SK: `NOTIFICATION#${now}#${notificationId}`,
            notificationId,
            recipientId: authorId,
            type: 'post_shared',
            actorId: sharerId,
            resourceId: originalPostId,
            resourceType: 'post',
            metadata: {
              sharedPostId,
              originalPostId,
            },
            isRead: false,
            createdAt: now,
            ttl,
          },
        })
      );
      console.log('Share notification sent to author:', authorId);
    } catch (error) {
      console.error('Failed to save share notification:', error);
      // Don't throw - notification failure shouldn't block share
    }
  }

  /**
   * Get original post for a shared post
   * Returns null if original post was deleted
   *
   * @param sharedPost - The shared post
   * @returns Original post or null if deleted
   */
  async getOriginalPost(
    sharedPost: Post
  ): Promise<(Post & { username?: string; authorAvatar?: string }) | null> {
    if (sharedPost.postType !== 'shared' || !sharedPost.sharedPost) {
      return null;
    }

    return this.getPost(sharedPost.sharedPost.originalPostId);
  }

  /**
   * Save recipe from post to Manager Recipe
   *
   * Key behavior:
   * - Only RECIPE DATA is saved (ingredients, steps, nutrition, etc.)
   * - Post TITLE is NOT saved - user sets their own title
   * - Images are COPIED to user's recipe folder (independent)
   * - Attribution is stored (immutable) for credit
   *
   * @param postId - Post ID to save recipe from
   * @param username - Username saving the recipe
   * @param customTitle - Optional custom title for the saved recipe
   * @returns Created recipe entity
   */
  async saveRecipeFromPost(postId: string, username: string, customTitle?: string): Promise<any> {
    // 1. Get post
    const post = await this.getPost(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // 2. Validate post type
    if (post.postType !== 'recipe_share') {
      throw new Error('Post is not a recipe share');
    }

    // 3. Check privacy (can user view this post?)
    if (post.privacyLevel === 'private' && post.authorId !== username) {
      throw new Error('You do not have permission to view this post');
    }

    // 4. Validate recipe data exists
    if (!post.recipeData && (!post.ingredients || post.ingredients.length === 0)) {
      throw new Error('Recipe data not found in post');
    }

    // 5. Get original author's username for attribution
    const authorResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${post.authorId}`,
          SK: 'PROFILE',
        },
      })
    );

    const authorUsername = authorResult.Item?.username || 'unknown';

    // 6. Generate new recipe ID
    const newRecipeId = uuidv4();
    const now = Date.now();

    // 7. Copy images from posts/{postId}/ to recipes/{username}/{newRecipeId}/
    const copiedImages = await this.copyPostImagesToRecipe(post, username, newRecipeId);

    // 8. Extract RECIPE DATA from recipeData (full data with amounts)
    // Use recipeData.ingredients which has full info (vietnamese, amount, notes)
    const recipeIngredients = (post.recipeData?.ingredients || []).map((ing: any) => ({
      vietnamese: ing.vietnamese || ing.name || '',
      english: ing.english || '',
      amount: ing.amount || '',
      notes: ing.notes || undefined,
    }));

    // Extract steps from recipeData (has descriptions)
    const recipeSteps = (post.recipeData?.steps || []).map((step: any, index: number) => ({
      stepNumber: step.stepNumber || index + 1,
      description: step.description || step.instruction || `Bước ${index + 1}`,
      images: step.images || [],
      duration: step.duration || undefined,
    }));

    // 9. Create recipe entity
    // Use recipe title from recipeData, fallback to custom title or generic
    const recipeTitle =
      post.recipeData?.title ||
      customTitle?.trim() ||
      `Công thức đã lưu - ${new Date().toLocaleDateString('vi-VN')}`;

    const recipe = {
      PK: `RECIPE#${newRecipeId}`,
      SK: 'METADATA',
      recipeId: newRecipeId,
      title: recipeTitle,
      description: post.recipeData?.description || '',
      ingredients: recipeIngredients,
      steps: recipeSteps,
      images: copiedImages,
      servings: post.servings || 2,
      cookingTime: post.cookingTime || 30,
      difficulty: post.difficulty || 'medium',
      source: 'saved', // Mark as saved from social
      attribution: {
        originalAuthorId: post.authorId,
        originalAuthorUsername: authorUsername,
        originalPostId: postId,
        savedAt: now,
      },
      nutrition: post.nutrition,
      authorId: username,
      isShared: false,
      sharedPostId: undefined,
      createdAt: now,
      updatedAt: now,
      GSI1PK: `USER#${username}`,
      GSI1SK: `RECIPE#${now}`,
      entityType: 'RECIPE',
    };

    // 10. Save recipe to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: recipe,
      })
    );

    // 11. Update post analytics (importCount)
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'ADD importCount :inc',
        ExpressionAttributeValues: {
          ':inc': 1,
        },
      })
    );

    // 12. Log for monitoring
    console.log('Recipe saved from post', {
      postId,
      recipeId: newRecipeId,
      originalAuthor: post.authorId,
      savedBy: username,
    });

    return recipe;
  }

  /**
   * Copy post images to recipe folder
   *
   * Copies images from posts/{postId}/ to recipes/{userId}/{recipeId}/
   * User gets independent images (not affected if post deleted)
   *
   * @param post - Post entity
   * @param username - Username saving the recipe
   * @param recipeId - New recipe ID
   * @returns Recipe images structure
   */
  private async copyPostImagesToRecipe(
    post: Post,
    username: string,
    recipeId: string
  ): Promise<any> {
    const copiedImages: any = {
      completed: '',
      steps: [],
    };

    // Copy completed dish image
    if (post.images?.recipeImages?.completed) {
      let sourceKey = post.images.recipeImages.completed;
      // Handle both https:// and non-https URLs
      if (sourceKey.startsWith('https://')) {
        sourceKey = sourceKey.replace(`https://${CDN_DOMAIN}/`, '');
      } else {
        sourceKey = sourceKey.replace(`${CDN_DOMAIN}/`, '');
      }
      const destKey = `recipes/${username}/${recipeId}/completed.jpg`;

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: CONTENT_BUCKET,
          CopySource: `${CONTENT_BUCKET}/${sourceKey}`,
          Key: destKey,
        })
      );

      copiedImages.completed = `https://${CDN_DOMAIN}/${destKey}`;
    }

    // Copy step images
    if (post.images?.recipeImages?.steps && post.images.recipeImages.steps.length > 0) {
      for (const step of post.images.recipeImages.steps) {
        const copiedStepImages: string[] = [];

        for (let imgIndex = 0; imgIndex < step.images.length; imgIndex++) {
          let sourceKey = step.images[imgIndex];
          // Handle both https:// and non-https URLs
          if (sourceKey.startsWith('https://')) {
            sourceKey = sourceKey.replace(`https://${CDN_DOMAIN}/`, '');
          } else {
            sourceKey = sourceKey.replace(`${CDN_DOMAIN}/`, '');
          }
          const destKey = `recipes/${username}/${recipeId}/step-${step.stepNumber}-${imgIndex + 1}.jpg`;

          await s3Client.send(
            new CopyObjectCommand({
              Bucket: CONTENT_BUCKET,
              CopySource: `${CONTENT_BUCKET}/${sourceKey}`,
              Key: destKey,
            })
          );

          copiedStepImages.push(`https://${CDN_DOMAIN}/${destKey}`);
        }

        copiedImages.steps.push(copiedStepImages);
      }
    }

    return copiedImages;
  }

  /**
   * Move images from temp folder to permanent location
   *
   * Flow:
   * 1. Copy each image from posts/temp/{userId}/ to posts/{userId}/
   * 2. Return array of final CDN URLs
   * 3. Temp files will be auto-deleted by S3 lifecycle after 24h
   *
   * @param tempKeys - Array of S3 keys in temp folder
   * @param userId - User ID for permanent folder path
   * @returns Array of final CDN URLs
   */
  private async moveImagesToPermament(tempKeys: string[], userId: string): Promise<string[]> {
    const finalUrls: string[] = [];

    for (const tempKey of tempKeys) {
      try {
        // Extract filename from temp key: posts/temp/{userId}/filename.jpg
        const filename = tempKey.split('/').pop() || `image-${Date.now()}.jpg`;

        // Create permanent key: posts/{userId}/filename.jpg
        const permanentKey = `posts/${userId}/${filename}`;

        // Copy from temp to permanent
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: CONTENT_BUCKET,
            CopySource: `${CONTENT_BUCKET}/${tempKey}`,
            Key: permanentKey,
          })
        );

        // Generate CDN URL
        const cdnUrl = `https://${CDN_DOMAIN}/${permanentKey}`;
        finalUrls.push(cdnUrl);

        console.log(`[PostService] Moved image: ${tempKey} -> ${permanentKey}`);
      } catch (error) {
        console.error(`[PostService] Failed to move image ${tempKey}:`, error);
        // Continue with other images, don't fail the whole operation
      }
    }

    return finalUrls;
  }
}
