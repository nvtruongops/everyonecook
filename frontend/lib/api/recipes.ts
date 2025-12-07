// Recipe API - Connects frontend to recipe-module backend
import apiClient from './client';
import type { ApiResponse } from '@/types';

export async function createRecipe(data: {
  title: string;
  description?: string;
  ingredients: string[];
  steps: string[];
  source?: 'ai' | 'manual';
  images?: string[];
}): Promise<ApiResponse<any>> {
  return (await apiClient.post('/recipes', data)).data;
}

export async function generateRecipeWithAI(data: {
  ingredients: string[]; // Vietnamese ingredient names (1-20 items)
  // Core Settings (affect caching)
  servings?: 1 | 2 | 3 | 4 | 5; // 1-5 people (default: 1)
  mealType?: 'none' | 'breakfast' | 'lunch' | 'dinner' | 'snack'; // 'none' = any meal
  maxTime?: 15 | 30 | 45 | 60 | 90 | 120; // minutes (default: 60)
  // Optional Filters (do NOT affect cache key)
  dislikedIngredients?: string[]; // Ingredients to avoid
  skillLevel?: 'none' | 'beginner' | 'intermediate' | 'expert'; // 'none' = any level
  preferredCookingMethods?: ('none' | 'kho' | 'xào' | 'luộc' | 'nướng' | 'hấp' | 'chiên')[]; // 'none' = any
}): Promise<ApiResponse<any>> {
  return (await apiClient.post('/recipes/generate-ai', data)).data;
}

export async function saveRecipe(recipeId: string): Promise<ApiResponse<any>> {
  return (await apiClient.post(`/recipes/${recipeId}/save`)).data;
}

export async function deleteRecipe(recipeId: string): Promise<ApiResponse<any>> {
  return (await apiClient.delete(`/recipes/${recipeId}`)).data;
}

export async function listUserRecipes(
  username: string,
  source?: 'ai' | 'manual' | 'saved'
): Promise<ApiResponse<any>> {
  const params = source ? { source } : {};
  return (await apiClient.get(`/users/${username}/recipes`, { params })).data;
}

export async function createRecipeGroup(username: string, data: any): Promise<ApiResponse<any>> {
  return (await apiClient.post(`/users/${username}/recipe-groups`, data)).data;
}

export async function shareRecipeToFeed(data: {
  recipeId: string;
  title?: string; // Custom title for post (optional, defaults to recipe title)
  content?: string;
  images?: string[];
  privacy?: 'public' | 'friends' | 'private';
}): Promise<ApiResponse<any>> {
  return (await apiClient.post('/posts/share-recipe', data)).data;
}

/**
 * Save recipe from a social post to user's Recipe Management
 *
 * Key behavior:
 * - Only RECIPE DATA is saved (ingredients, steps, nutrition, etc.)
 * - Post TITLE is NOT saved - user can provide custom title
 * - Images are COPIED to user's recipe folder (independent)
 */
export async function saveRecipeFromPost(
  postId: string,
  customTitle?: string
): Promise<ApiResponse<any>> {
  return (await apiClient.post(`/posts/${postId}/save-recipe`, { customTitle })).data;
}
