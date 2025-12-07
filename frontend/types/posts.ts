/**
 * Post Types
 */

/**
 * Shared post reference - for posts that share another post
 */
export interface SharedPostReference {
  originalPostId: string;
  originalAuthorId: string;
  originalAuthorUsername?: string;
  originalAuthorAvatar?: string;
  sharedAt: string;
  isDeleted?: boolean;
  originalPost?: {
    isDeleted: boolean;
    post_id?: string;
    user_id?: string;
    username?: string;
    user_avatar?: string;
    title?: string;
    content?: string;
    caption?: string;
    images?: string[];
    postType?: 'quick' | 'recipe_share' | 'shared';
    recipeData?: Recipe;
    recipe_id?: string;
    likes_count?: number;
    comments_count?: number;
    created_at?: string;
  };
}

export interface Post {
  postId: string;
  post_id: string; // API response format
  authorId: string;
  user_id?: string; // API response format
  author?: User;
  username?: string; // API response format
  user_avatar?: string; // API response format
  content: string;
  images?: string[];
  recipeId?: string;
  recipe_id?: string; // API response format
  recipeData?: Recipe; // Full recipe data from API
  privacy: 'public' | 'friends' | 'private';
  is_public?: boolean; // API response format
  likeCount: number;
  likes_count: number; // API response format
  commentCount: number;
  comments_count: number; // API response format
  shares_count?: number; // Share count
  isLiked?: boolean;
  user_reaction?: string; // API response format
  createdAt: number;
  created_at?: number; // API response format
  updatedAt: number;
  // For shared posts (postType === 'shared')
  postType?: 'quick' | 'recipe_share' | 'shared';
  sharedPost?: SharedPostReference;
  // Attribution for recipes saved from social (credit original author)
  recipeAttribution?: {
    originalAuthorId: string;
    originalAuthorUsername: string;
    savedAt?: number;
  };
}

export interface Comment {
  commentId: string;
  postId: string;
  authorId: string;
  author?: User;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id?: string; // For AuthContext compatibility
  userId: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
  sub?: string; // Cognito user ID
  name?: string;
  email?: string;
}

export interface RecipeStep {
  stepNumber: number;
  description: string;
  images?: string[];
  duration?: number;
}

export interface RecipeIngredient {
  vietnamese: string;
  english?: string;
  amount?: string;
  notes?: string;
}

export interface Recipe {
  recipe_id?: string;
  title: string;
  description?: string;
  ingredients: RecipeIngredient[] | any[];
  steps?: RecipeStep[]; // Full cooking steps with images
  instructions?: any[]; // Legacy format
  images?: {
    completed?: string;
  };
  cuisine_type?: string;
  meal_type?: string;
  cookingTime?: number;
  prep_time_minutes?: number;
  servings?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | string;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
  };
}

export enum ReportReason {
  SPAM = 'spam',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  INAPPROPRIATE = 'inappropriate_content', // Alias
  HARASSMENT = 'harassment',
  MISINFORMATION = 'misinformation',
  FALSE_INFO = 'misinformation', // Alias
  OTHER = 'other',
}

export enum PrivacyLevel {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private',
}
