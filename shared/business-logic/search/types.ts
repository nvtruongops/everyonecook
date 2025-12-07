/**
 * Shared Types for Search Services
 */

// Common search result interface
export interface SearchResult<T> {
  items: T[];
  total?: number;
  cursor?: string;
  hasMore: boolean;
  searchMethod?: 'dynamodb' | 'gsi4' | 'gsi3' | 'gsi2';
  duration?: number;
  fallbackReason?: string;
}

// Search filters
export interface SearchFilters {
  source?: ('ai' | 'social')[];
  difficulty?: 'easy' | 'medium' | 'hard';
  cookingTime?: { min?: number; max?: number };
  dietary?: ('vegetarian' | 'vegan' | 'gluten-free')[];
  cuisineType?: ('vietnamese' | 'chinese' | 'western')[];
  servings?: { min?: number; max?: number };
  privacyLevel?: 'public' | 'friends' | 'private';
}

// Unified search query
export interface UnifiedSearchQuery {
  text?: string; // Text query for DynamoDB
  ingredients?: string[]; // Ingredients for GSI4
  filters?: SearchFilters;
  settings?: {
    servings?: number;
    mealType?: string;
    maxTime?: number;
    preferredCookingMethods?: string[];
    dislikedIngredients?: string[];
  };
  limit?: number;
  offset?: number;
  cursor?: string;
}

// Recipe interface
export interface Recipe {
  id: string;
  postId?: string;
  title: string;
  description?: string;
  ingredients: string[];
  cookingTime?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  servings?: number;
  cuisineType?: string;
  dietaryRestrictions?: string[];
  authorId: string;
  authorName?: string;
  imageUrls?: string[];
  likes?: number;
  shares?: number;
  rating?: number;
  popularity?: number;
  createdAt: number;
  updatedAt: number;
  privacyLevel?: 'public' | 'friends' | 'private';
  source: 'ai' | 'social';
  searchableText?: string;
}

// Feed options
export interface FeedOptions {
  limit?: number;
  cursor?: string;
}

// Trending options
export interface TrendingOptions {
  limit?: number;
  minLikes?: number;
}

// Ingredient search options
export interface IngredientSearchOptions {
  ingredients: string[];
  limit?: number;
  cursor?: string;
}
