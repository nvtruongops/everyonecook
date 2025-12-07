/**
 * Nutrition Service
 *
 * Provides nutrition calculation using backend Dictionary + Translation Cache.
 * Flow: Vietnamese ingredient → Normalize → Dictionary/Cache lookup → Calculate
 *
 * Performance:
 * - Dictionary hit: <50ms, $0
 * - Translation Cache hit: <50ms, $0
 * - AI fallback (new ingredient): 2-3s, $0.01
 */

import { NutritionProfile } from '@/types/nutrition';

export interface IngredientWithAmount {
  vietnamese: string;
  english?: string;
  amount: string; // e.g., "500g", "2 cups"
}

export interface NutritionCalculationResult {
  perRecipe: NutritionProfile;
  perServing?: NutritionProfile;
  ingredientBreakdown: Array<{
    ingredient: string;
    amount: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  missingIngredients?: string[];
}

export interface IngredientLookupResult {
  found: boolean;
  translation: string | { specific: string; general: string; category: string };
  vietnamese: string;
  normalized: string;
  category?: string;
}

export const nutritionService = {
  /**
   * Calculate nutrition for a list of ingredients
   * Calls backend POST /ai/nutrition
   */
  async calculateNutrition(
    ingredients: IngredientWithAmount[],
    servings: number = 1
  ): Promise<NutritionProfile> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/nutrition/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients, servings }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Nutrition calculation failed');
      }

      const data = await response.json();

      return {
        calories: data.perRecipe?.calories || 0,
        protein: data.perRecipe?.protein || 0,
        carbs: data.perRecipe?.carbs || 0,
        fat: data.perRecipe?.fat || 0,
        fiber: data.perRecipe?.fiber || 0,
        sugar: data.perRecipe?.sugar || 0,
        sodium: data.perRecipe?.sodium || 0,
      };
    } catch (error) {
      console.error('Nutrition calculation error:', error);
      return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
    }
  },

  /**
   * Calculate nutrition with full breakdown
   */
  async calculateNutritionWithBreakdown(
    ingredients: IngredientWithAmount[],
    servings: number = 1
  ): Promise<NutritionCalculationResult> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/nutrition/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients, servings }),
      });

      if (!response.ok) {
        throw new Error('Nutrition calculation failed');
      }

      const data = await response.json();

      return {
        perRecipe: data.perRecipe || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        perServing: data.perServing,
        ingredientBreakdown: data.ingredientBreakdown || [],
        missingIngredients: data.missingIngredients,
      };
    } catch (error) {
      console.error('Nutrition calculation error:', error);
      return {
        perRecipe: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        ingredientBreakdown: [],
      };
    }
  },

  /**
   * Lookup ingredient translation and nutrition
   * Calls backend GET /dictionary/{ingredient}
   */
  async lookupIngredient(ingredient: string): Promise<IngredientLookupResult | null> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const apiVersion = process.env.NEXT_PUBLIC_API_VERSION || 'api';
      const encodedIngredient = encodeURIComponent(ingredient);

      const response = await fetch(`${apiUrl}/${apiVersion}/dictionary/${encodedIngredient}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Ingredient lookup error:', error);
      return null;
    }
  },

  /**
   * Calculate nutrition for recipe ingredients
   * Parses ingredient strings like "500g chicken breast" or "2 cups rice"
   */
  async calculateRecipeNutrition(
    recipeId: string,
    ingredients: string[],
    servings: number = 1
  ): Promise<NutritionProfile> {
    // Parse ingredient strings to extract amount and name
    const ingredientsWithAmount = ingredients.map((ing) => {
      // Try to parse "500g chicken breast" or "2 cups rice" format
      const match = ing.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
      if (match) {
        return {
          vietnamese: match[3].trim(),
          amount: `${match[1]}${match[2] || 'g'}`,
        };
      }
      // Fallback: assume 100g
      return { vietnamese: ing, amount: '100g' };
    });
    return this.calculateNutrition(ingredientsWithAmount, servings);
  },

  async saveNutrition(recipeId: string, nutrition: NutritionProfile, token: string): Promise<void> {
    // Nutrition is calculated on-demand, no need to save separately
    console.log('Nutrition save skipped - calculated on-demand');
  },

  async getNutrition(recipeId: string, token: string): Promise<NutritionProfile | null> {
    // Nutrition is calculated on-demand from recipe ingredients
    return null;
  },

  async getNutritionProfile(recipeId: string): Promise<NutritionProfile | null> {
    return null;
  },

  async calculateAndSaveNutrition(
    recipeId: string,
    ingredients: string[],
    token: string
  ): Promise<NutritionProfile> {
    const ingredientsWithAmount = ingredients.map((ing) => ({
      vietnamese: ing,
      amount: '100g',
    }));
    return this.calculateNutrition(ingredientsWithAmount);
  },
};
