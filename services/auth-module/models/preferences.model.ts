/**
 * User Preferences Models
 *
 * Defines user cooking preferences for AI recipe suggestions
 * - Stable preferences: Long-term preferences (skill level, dietary restrictions, etc.)
 * - Frequent preferences: Context-specific preferences (recent ingredients, meal types, etc.)
 *
 * @module models/preferences
 */

/**
 * Stable Preferences (Long-term)
 * Stored as: PK: USER#{userId}, SK: PREFERENCES#STABLE
 */
export interface StablePreferences {
  PK: string; // USER#{userId}
  SK: string; // PREFERENCES#STABLE
  userId: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  spiceLevel: 'mild' | 'medium' | 'hot' | 'very_hot';
  dietaryRestrictions: string[]; // ['vegetarian', 'vegan', 'gluten-free', etc.]
  dislikedIngredients: string[]; // Ingredients user doesn't like
  favoriteCuisines: string[]; // ['vietnamese', 'italian', 'japanese', etc.]
  budgetLevel: 'economical' | 'moderate' | 'premium' | '';
  kitchenEquipment: string[]; // ['stove', 'oven', 'microwave', 'blender', etc.]
  updatedAt: number;
}

/**
 * Frequent Preferences (Context-specific)
 * Stored as: PK: USER#{userId}, SK: PREFERENCES#FREQUENT
 */
export interface FrequentPreferences {
  PK: string; // USER#{userId}
  SK: string; // PREFERENCES#FREQUENT
  userId: string;
  recentIngredients: string[]; // Last used ingredients (max 20)
  recentMealTypes: Array<'breakfast' | 'lunch' | 'dinner' | 'snack' | 'custom'>; // Last used meal types (max 10)
  recentServings: number; // Last used servings
  recentMaxTime: number; // Last used max time
  lastUsedAt: number;
}

/**
 * Request to update stable preferences
 */
export interface UpdateStablePreferencesRequest {
  skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  spiceLevel?: 'mild' | 'medium' | 'hot' | 'very_hot';
  dietaryRestrictions?: string[];
  dislikedIngredients?: string[];
  favoriteCuisines?: string[];
  budgetLevel?: 'economical' | 'moderate' | 'premium' | '';
  kitchenEquipment?: string[];
}

/**
 * Request to update frequent preferences
 */
export interface UpdateFrequentPreferencesRequest {
  recentIngredients?: string[];
  recentMealTypes?: Array<'breakfast' | 'lunch' | 'dinner' | 'snack' | 'custom'>;
  recentServings?: number;
  recentMaxTime?: number;
}
