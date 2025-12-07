/**
 * Post Model
 *
 * Data models and types for social posts
 */

/**
 * Post type enum
 */
export type PostType = 'quick' | 'recipe_share' | 'shared';

/**
 * Privacy level enum
 */
export type PrivacyLevel = 'public' | 'friends' | 'private';

/**
 * Post status enum
 */
export type PostStatus = 'active' | 'under_review' | 'hidden';

/**
 * Structured image data for posts
 */
export interface PostImages {
  type: 'quick' | 'recipe';

  // For Quick Posts (max 3 images)
  quickImages?: string[]; // ["posts/{postId}/quick-1.jpg", ...]

  // For Recipe Share Posts
  recipeImages?: {
    completed: string; // Thumbnail: "posts/{postId}/recipe-completed.jpg"
    steps: {
      // Step images: "posts/{postId}/recipe-step-{n}-{i}.jpg"
      stepNumber: number;
      images: string[]; // Max 2 per step
    }[];
  };
}

/**
 * Nutrition information
 */
export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

/**
 * Recipe step with description and images
 */
export interface RecipeStep {
  stepNumber: number;
  description: string;
  images?: string[]; // Step images (max 3 per step)
  duration?: number; // Optional duration in minutes
}

/**
 * Full recipe data embedded in post
 * This is COPIED from recipe when sharing (not reference)
 */
export interface EmbeddedRecipeData {
  title: string;
  description?: string;
  ingredients: Array<{
    vietnamese: string;
    english?: string;
    amount?: string;
    notes?: string;
  }>;
  steps: RecipeStep[];
  images: {
    completed?: string; // Main dish image
  };
  servings?: number;
  cookingTime?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  nutrition?: Nutrition;
}

/**
 * Post entity (DynamoDB)
 */
export interface Post {
  // Primary Keys
  PK: string; // "POST#{postId}"
  SK: string; // "METADATA"

  // Post Data
  postId: string;
  authorId: string;
  postType: PostType;
  recipeId?: string; // Link to Manager Recipe (only for recipe_share)

  title: string;
  caption: string;
  images: PostImages;

  // Recipe Data (only for recipe_share type)
  // Full recipe data embedded in post (COPIED, not reference)
  recipeData?: EmbeddedRecipeData;

  // Attribution for recipes saved from social (credit original author)
  // Only present when sharing a recipe that was saved from another user's post
  recipeAttribution?: {
    originalAuthorId: string;
    originalAuthorUsername: string;
    savedAt?: number;
  };

  // Legacy fields (kept for backward compatibility)
  ingredients?: string[]; // Normalized English ingredients for search
  servings?: number;
  cookingTime?: number;
  difficulty?: string;
  nutrition?: Nutrition;

  // Privacy & Visibility
  privacyLevel: PrivacyLevel;
  tags: string[];
  searchableText: string; // title + caption + ingredients (only for recipe_share)

  // Engagement Metrics
  likes: number;
  comments: number;
  shares: number;
  views: number;
  importCount?: number; // Number of times recipe was saved from this post

  // Moderation
  reportCount: number;
  status: PostStatus;
  hiddenAt?: string;
  hiddenReason?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Shared post data (only for postType === 'shared')
  sharedPost?: SharedPostReference;

  // GSI Indexes
  GSI2PK: string; // "POST#PUBLIC" (for public feed)
  GSI2SK: string; // timestamp (for sorting)
  GSI3PK: string; // "POST#TRENDING" (for trending)
  GSI3SK: string; // "{likes}#{timestamp}"
}

/**
 * Ingredient Index entity (for search)
 */
export interface IngredientIndex {
  PK: string; // "POST#{postId}"
  SK: string; // "INGREDIENT#{normalized}"

  ingredientName: string; // Normalized English

  // GSI4 for ingredient-based search
  GSI4PK: string; // "POST_INGREDIENT#{normalized}"
  GSI4SK: string; // "POST#{postId}"
}

/**
 * Quick Post creation data
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
export interface QuickPostData {
  title: string;
  caption?: string; // Optional caption/description
  images?: string[]; // Final CDN URLs for display (optional)
  tempImageKeys?: string[]; // S3 temp keys for backend to move (optional)
  privacyLevel?: PrivacyLevel;
  tags?: string[];
}

/**
 * Recipe Share Post creation data
 *
 * Flow 2: Share từ Recipe Management
 * - recipeId: ID của recipe trong Recipe Management
 * - title: Tiêu đề post (có thể khác với recipe title)
 * - Data được COPY từ recipe (không reference)
 * - Post và Recipe độc lập sau khi share
 */
export interface RecipeShareData {
  recipeId: string; // Reference to recipe in recipe-module
  title?: string; // Custom title for post (optional, defaults to recipe title)
  caption?: string; // Custom caption/description
  images?: string[]; // Custom images (optional, can use recipe images if empty)
  privacyLevel?: PrivacyLevel;
}

/**
 * Post update data
 *
 * Edit restrictions:
 * - Owner can only edit TITLE (not caption, images, recipe data)
 * - Privacy level can be changed
 */
export interface PostUpdateData {
  title?: string; // Only title can be edited
  privacyLevel?: PrivacyLevel;
}

/**
 * Shared post data - for sharing another user's post (like Facebook)
 *
 * When user shares a post:
 * - Creates a NEW post with reference to original post
 * - Original post data is NOT copied (only referenced)
 * - If original post is deleted, shared post shows "Post không khả dụng"
 * - Share caption is the sharer's own content
 */
export interface SharePostData {
  originalPostId: string; // Reference to original post
  caption?: string; // Sharer's own caption/comment
  privacyLevel?: PrivacyLevel;
}

/**
 * Original post reference in shared post
 * Stored in sharedPost field when postType is 'shared'
 */
export interface SharedPostReference {
  originalPostId: string;
  originalAuthorId: string;
  originalAuthorUsername?: string;
  originalAuthorAvatar?: string;
  // Snapshot of original post at share time (for display if original deleted)
  snapshot?: {
    title?: string;
    content?: string;
    images?: string[];
    recipeData?: EmbeddedRecipeData;
    postType?: PostType;
  };
  sharedAt: string;
}

/**
 * Save Recipe from Post data
 *
 * When user saves recipe from post:
 * - Only RECIPE DATA is saved (ingredients, steps, nutrition, etc.)
 * - Post TITLE is NOT saved (user can set their own title)
 * - Images are COPIED to user's recipe folder
 */
export interface SaveRecipeFromPostData {
  postId: string;
  customTitle?: string; // User can set custom title for saved recipe
}

/**
 * Recipe from Manager Recipe (for sharing)
 */
export interface Recipe {
  recipeId: string;
  userId: string;
  title: string;
  description?: string;
  ingredients: Array<{
    normalized: string;
    original: string;
    vietnamese?: string;
    english?: string;
    amount?: string;
    notes?: string;
  }>;
  steps?: Array<{
    stepNumber: number;
    description: string;
    duration?: number;
    images?: string[];
  }>;
  servings: number;
  cookingTime: number;
  difficulty: string;
  nutrition?: Nutrition;
  images: {
    completed?: string;
    steps?: string[][]; // Legacy format
  };
  isShared?: boolean;
  sharedPostId?: string;
}

/**
 * Recipe summary for picker
 */
export interface RecipeSummary {
  recipeId: string;
  title: string;
  thumbnail: string;
  ingredientsCount: number;
  servings: number;
  cookingTime: number;
  difficulty: string;
  createdAt: string;
  isShared: boolean;
  sharedPostId?: string;
}
