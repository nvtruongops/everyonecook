/**
 * Recipe Types
 */

export interface Recipe {
  recipe_id: string;
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions?: RecipeStep[]; // API uses 'instructions'
  steps?: RecipeStep[]; // Keep for compatibility
  images?: string[];
  image_url?: string; // API response format
  cookingTime?: number;
  cook_time_minutes?: number; // API response format
  prep_time_minutes?: number; // API response format
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  cuisine_type: string;
  meal_type: string;
  cooking_method?: string; // API response format
  tags?: string[];
  nutrition?: NutritionProfile;
  nutritional_info?: NutritionProfile; // API response format
  authorId?: string;
  author?: User;
  source: 'ai' | 'user' | 'community';
  is_ai_generated?: boolean; // API response format
  createdAt: number;
  updatedAt: number;
}

export interface Ingredient {
  name: string;
  ingredient_name?: string; // API response format
  amount: number;
  quantity?: number; // API response format
  unit: string;
  notes?: string;
  preparation?: string; // API response format
  is_optional?: boolean; // API response format
}

export interface RecipeStep {
  stepNumber: number;
  instruction: string;
  description?: string; // Alias for instruction
  duration?: number;
  duration_minutes?: number; // API format
  images?: string[];
  tips?: string[]; // Cooking tips
}

export interface User {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
}

export interface NutritionProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export function getCookingMethodLabel(method?: string): string {
  return method || 'Unknown';
}

export function getCookingMethodColor(method?: string): string {
  return 'blue';
}

export function formatTime(minutes?: number): string {
  if (!minutes) return '0 min';
  return `${minutes} min`;
}

export function getTotalTime(recipe: Recipe): number {
  return recipe.cookingTime || recipe.cook_time_minutes || 0;
}

export function getCuisineTypeLabel(cuisine: string): string {
  return cuisine;
}

export function getMealTypeLabel(meal: string): string {
  return meal;
}

// AI Suggestion types
export interface AISuggestionResponse {
  recipes: Recipe[];
  suggestions: string[];
  warnings?: string[];
}

export interface AISuggestionRequest {
  ingredients: string[];
  preferences?: {
    cuisine?: string;
    mealType?: string;
    difficulty?: string;
  };
}

