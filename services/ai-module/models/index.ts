/**
 * AI Module Models
 *
 * Central export for all AI module type definitions.
 */

// Suggestion models (AI-generated recipes)
export * from './suggestion.model';

// Dictionary models
export * from './dictionary.model';

// Recipe models (Manager Recipe - use specific exports to avoid conflicts)
export type {
  RecipeSource,
  RecipeEntity,
  RecipeSummary,
  RecipeDetails,
  CreateRecipeRequest,
  UpdateRecipeRequest,
  GetUserRecipesRequest,
  GetUserRecipesResponse,
  RecipeAttribution,
  RecipeNutrition,
} from './recipe.model';

// Re-export shared types from suggestion.model (these are the canonical versions)
// RecipeDifficulty, RecipeIngredient, RecipeStep, RecipeImages are already exported from suggestion.model
