/**
 * Shared TypeScript Types
 *
 * Core types used across the application
 */

// ============================================================================
// User Types
// ============================================================================

export interface User {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  bio?: string;
  birthday?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  country?: string;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string | null;
  bannedAt?: number | null;
  bannedBy?: string | null;
  banDuration?: number | null;
  banExpiresAt?: number | null;
  totalPosts?: number;
  totalRecipes?: number;
  totalFriends?: number;
  lastLoginAt?: number;
  createdAt: number;
  updatedAt: number;
  sub?: string; // Cognito user ID (from JWT token)
}

export interface UserProfile extends User {
  privacySettings?: PrivacySettings;
  aiPreferences?: AIPreferences;
}

export interface PrivacySettings {
  fullName: 'public' | 'friends' | 'private';
  email: 'public' | 'friends' | 'private';
  birthday: 'public' | 'friends' | 'private';
  gender: 'public' | 'friends' | 'private';
  country: 'public' | 'friends' | 'private';
  bio: 'public' | 'friends' | 'private';
  avatarUrl: 'public' | 'friends' | 'private';
  backgroundUrl: 'public' | 'friends' | 'private';
  statistics: 'public' | 'friends' | 'private'; // totalPosts, totalRecipes, totalFriends
}

export interface AIPreferences {
  dietaryRestrictions: string[];
  allergies: string[];
  preferredCuisines: string[];
  dislikedIngredients: string[];
  cookingSkillLevel: 'beginner' | 'intermediate' | 'advanced';
  servingSize: number;
}

// ============================================================================
// Post Types
// ============================================================================

export interface Post {
  postId: string;
  authorId: string;
  author?: User;
  content: string;
  images?: string[];
  recipeId?: string;
  recipe?: Recipe;
  privacy: 'public' | 'friends' | 'private';
  likeCount: number;
  commentCount: number;
  isLiked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Comment {
  commentId: string;
  comment_id: string; // API format (snake_case)
  id?: string; // Alternative ID field
  postId: string;
  authorId: string;
  user_id?: string; // API format
  author?: User;
  content: string;
  text?: string; // API format
  username?: string; // Author username
  avatar_url?: string; // Author avatar
  reply_count?: number; // Number of replies
  parent_comment_id?: string; // Parent comment ID for replies
  createdAt: number;
  created_at?: string; // API format
  updatedAt: number;
}

// ============================================================================
// Recipe Types
// ============================================================================

export interface Recipe {
  recipeId: string;
  title: string;
  description: string;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  images?: string[];
  cookingTime: number; // minutes
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  cuisine?: string;
  tags?: string[];
  nutrition?: NutritionInfo;
  authorId?: string;
  author?: User;
  source: 'ai' | 'user' | 'community';
  createdAt: number;
  updatedAt: number;
}

export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
  notes?: string;
}

export interface RecipeStep {
  stepNumber: number;
  instruction: string;
  duration?: number; // minutes
  images?: string[];
}

export interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

// ============================================================================
// Friend Types
// ============================================================================

export interface Friend {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: number;
}

export interface FriendRequest {
  requestId: string;
  fromUserId: string;
  fromUser?: User;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  notificationId: string;
  userId: string;
  type: 'like' | 'comment' | 'friend_request' | 'friend_accepted' | 'mention';
  title: string;
  message: string;
  relatedId?: string; // postId, commentId, userId, etc.
  relatedUser?: User;
  isRead: boolean;
  createdAt: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  correlationId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
  total?: number;
}

// ============================================================================
// Form Types
// ============================================================================

export interface LoginForm {
  username: string;
  password: string;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

export interface ProfileUpdateForm {
  fullName?: string;
  bio?: string;
  birthday?: string;
  gender?: string;
  country?: string;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchFilters {
  query?: string;
  cuisine?: string;
  difficulty?: string;
  maxCookingTime?: number;
  tags?: string[];
}

export interface SearchResult {
  recipes: Recipe[];
  posts: Post[];
  users: User[];
}
