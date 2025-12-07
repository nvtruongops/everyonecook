/**
 * Nutrition Calculation Handler
 *
 * Calculates nutritional information for recipes using unified ingredient processing.
 * Uses processIngredients from ingredient.service.ts for consistent lookup:
 * Dictionary → Translation Cache → AI (if needed)
 *
 * Flow:
 * 1. Receive ingredients with amounts
 * 2. Process ingredients using ingredient.service.ts (unified lookup)
 * 3. Calculate nutrition based on amount (multiplier = amount / 100g)
 * 4. Sum nutrition across all ingredients
 * 5. Calculate per-serving nutrition (if servings specified)
 *
 * Benefits of unified approach:
 * - Single source of truth for ingredient lookup
 * - AI fallback automatically saves to Translation Cache (1 year TTL)
 * - No duplicate lookups or inconsistent results
 *
 * @see services/recipe-module/services/ingredient.service.ts - Unified ingredient processing
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  processIngredients,
  IngredientInput,
} from '../../recipe-module/services/ingredient.service';
import { ProcessedIngredient } from '../../recipe-module/models/recipe.model';
import { UNIT_TO_GRAMS, INGREDIENT_UNIT_CONVERSIONS } from '../models';

// Environment variables
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

/**
 * Nutrition calculation request
 */
interface CalculateNutritionRequest {
  /** Ingredients with amounts */
  ingredients: Array<{
    vietnamese: string;
    english?: string;
    amount: string;
  }>;
  /** Number of servings (optional) */
  servings?: number;
}

/**
 * Nutrition breakdown per ingredient
 */
interface IngredientNutritionBreakdown {
  ingredient: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}

/**
 * Nutrition totals
 */
interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
  sugar: number;
}

/**
 * Nutrition calculation response
 */
interface CalculateNutritionResponse {
  perRecipe: NutritionTotals;
  perServing?: NutritionTotals;
  ingredientBreakdown: IngredientNutritionBreakdown[];
  missingIngredients?: string[];
  sources: { dictionary: number; cache: number; ai: number };
}

/**
 * Structured logger
 */
function logger(level: string, message: string, metadata?: Record<string, any>): void {
  if (LOG_LEVEL === 'DEBUG' || level !== 'DEBUG') {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        service: 'ai-module',
        handler: 'nutrition',
        ...metadata,
      })
    );
  }
}

/**
 * Parse amount string to extract value and unit
 */
function parseAmount(amountStr: string): { value: number; unit: string } {
  if (!amountStr) return { value: 100, unit: 'g' };

  const match = amountStr.toLowerCase().match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/);
  if (!match) return { value: 100, unit: 'g' };

  return {
    value: parseFloat(match[1]),
    unit: match[2] || 'g',
  };
}

/**
 * Convert amount to grams
 */
function convertToGrams(value: number, unit: string, englishIngredient?: string): number {
  // Check ingredient-specific conversions first
  if (englishIngredient && INGREDIENT_UNIT_CONVERSIONS[englishIngredient]) {
    const ingredientConversions = INGREDIENT_UNIT_CONVERSIONS[englishIngredient];
    if (ingredientConversions[unit]) {
      return value * ingredientConversions[unit];
    }
  }

  // Use generic conversions
  if (UNIT_TO_GRAMS[unit]) {
    return value * UNIT_TO_GRAMS[unit];
  }

  // Default: assume grams
  return value;
}

/**
 * Calculate per-serving nutrition
 */
function calculatePerServing(perRecipe: NutritionTotals, servings: number): NutritionTotals {
  return {
    calories: Math.round((perRecipe.calories / servings) * 10) / 10,
    protein: Math.round((perRecipe.protein / servings) * 10) / 10,
    carbs: Math.round((perRecipe.carbs / servings) * 10) / 10,
    fat: Math.round((perRecipe.fat / servings) * 10) / 10,
    fiber: Math.round((perRecipe.fiber / servings) * 10) / 10,
    sodium: Math.round((perRecipe.sodium / servings) * 10) / 10,
    sugar: Math.round((perRecipe.sugar / servings) * 10) / 10,
  };
}

/**
 * Lambda handler for nutrition calculation
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const correlationId = event.headers['x-correlation-id'] || uuidv4();

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
        body: JSON.stringify({
          error: { code: 'MISSING_BODY', message: 'Request body is required', correlationId },
        }),
      };
    }

    const request: CalculateNutritionRequest = JSON.parse(event.body);

    // Validate ingredients
    if (
      !request.ingredients ||
      !Array.isArray(request.ingredients) ||
      request.ingredients.length === 0
    ) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
        body: JSON.stringify({
          error: {
            code: 'INVALID_INGREDIENTS',
            message: 'Ingredients array is required',
            correlationId,
          },
        }),
      };
    }

    logger('INFO', 'Processing nutrition calculation request', {
      correlationId,
      ingredientsCount: request.ingredients.length,
      servings: request.servings,
    });

    // Step 1: Convert to IngredientInput format for processIngredients
    const ingredientInputs: IngredientInput[] = request.ingredients.map((ing) => ({
      vietnamese: ing.vietnamese,
      amount: ing.amount,
    }));

    // Step 2: Process ingredients using unified service
    // This handles: Dictionary → Translation Cache → AI (if needed)
    const processedIngredients = await processIngredients(ingredientInputs);

    // Step 3: Calculate nutrition for each ingredient
    const ingredientBreakdown: IngredientNutritionBreakdown[] = [];
    const missingIngredients: string[] = [];
    const sources = { dictionary: 0, cache: 0, ai: 0 };

    const totals: NutritionTotals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
      sugar: 0,
    };

    for (const processed of processedIngredients) {
      // Track source
      if (processed.source === 'dictionary') sources.dictionary++;
      else if (processed.source === 'cache') sources.cache++;
      else if (processed.source === 'ai') sources.ai++;

      // Check if nutrition data available
      if (!processed.nutrition) {
        missingIngredients.push(processed.vietnamese);
        continue;
      }

      // Parse amount and convert to grams
      const { value, unit } = parseAmount(processed.amount || '100g');
      const amountInGrams = convertToGrams(value, unit, processed.english || '');
      const multiplier = amountInGrams / 100;

      // Calculate nutrition for this ingredient
      const breakdown: IngredientNutritionBreakdown = {
        ingredient: processed.vietnamese,
        amount: processed.amount || '100g',
        calories: Math.round((processed.nutrition.calories || 0) * multiplier * 10) / 10,
        protein: Math.round((processed.nutrition.protein || 0) * multiplier * 10) / 10,
        carbs: Math.round((processed.nutrition.carbs || 0) * multiplier * 10) / 10,
        fat: Math.round((processed.nutrition.fat || 0) * multiplier * 10) / 10,
        source: processed.source || 'unknown',
      };

      ingredientBreakdown.push(breakdown);

      // Add to totals
      totals.calories += breakdown.calories;
      totals.protein += breakdown.protein;
      totals.carbs += breakdown.carbs;
      totals.fat += breakdown.fat;
      totals.fiber += (processed.nutrition.fiber || 0) * multiplier;
    }

    // Round totals
    const perRecipe: NutritionTotals = {
      calories: Math.round(totals.calories * 10) / 10,
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
      fiber: Math.round(totals.fiber * 10) / 10,
      sodium: Math.round(totals.sodium * 10) / 10,
      sugar: Math.round(totals.sugar * 10) / 10,
    };

    // Calculate per-serving if servings specified
    let perServing: NutritionTotals | undefined;
    if (request.servings && request.servings > 0) {
      perServing = calculatePerServing(perRecipe, request.servings);
    }

    const duration = Date.now() - startTime;

    logger('INFO', 'Nutrition calculation completed', {
      correlationId,
      duration,
      ingredientsProcessed: ingredientBreakdown.length,
      missingCount: missingIngredients.length,
      sources,
    });

    // Build response
    const response: CalculateNutritionResponse = {
      perRecipe,
      perServing,
      ingredientBreakdown,
      sources,
    };

    if (missingIngredients.length > 0) {
      response.missingIngredients = missingIngredients;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      body: JSON.stringify(response),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger('ERROR', 'Nutrition calculation handler failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process nutrition calculation',
          correlationId,
        },
      }),
    };
  }
}
