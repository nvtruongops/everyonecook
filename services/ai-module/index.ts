/**
 * Recipe & AI Module - Main Entry Point
 *
 * This module handles AI-powered recipe suggestions and recipe management for Everyone Cook platform.
 *
 * Features:
 * - AI recipe suggestions based on available ingredients (Dictionary-first strategy)
 * - Recipe search (DynamoDB)
 * - Ingredient lookup and translation (Vietnamese ↔ English)
 * - Nutrition calculation
 * - Recipe CRUD operations
 * - Cache management (Dictionary, Translation Cache, AI Cache)
 *
 * Architecture:
 * - Dictionary-first: 99% operations use Dictionary (cost optimization)
 * - Hybrid cache: Exact match → Partial match → AI generation
 * - Event-driven: SQS queues for async AI processing
 * - Vietnamese normalization: Critical for duplicate prevention
 *
 * @module ai-module
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler as suggestionHandler } from './handlers/suggestion.handler';
import { handler as jobStatusHandler } from './handlers/job-status.handler';
import { handler as recipeHandler } from './handlers/recipe.handler';
import { handler as nutritionHandler } from './handlers/nutrition.handler';
import { handler as lookupHandler } from './handlers/lookup.handler';
import { addDictionaryEntry } from './handlers/dictionary.handler';

/**
 * Main Lambda handler for Recipe & AI module
 * Routes requests to appropriate handlers based on path and method
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda execution context
 * @returns API Gateway proxy result
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const path = event.path || event.resource || '';
  const method = event.httpMethod;

  console.log('AI Module Request:', {
    path,
    method,
    requestId: context.awsRequestId,
  });

  // Route to appropriate handler
  try {
    // ============================================
    // AI Suggestion Routes
    // ============================================

    // POST /ai/suggestions - AI recipe suggestions
    if (method === 'POST' && path.endsWith('/ai/suggestions')) {
      return await suggestionHandler(event);
    }

    // GET /ai/suggestions/{jobId} - Get job status
    if (method === 'GET' && path.includes('/ai/suggestions/')) {
      return await jobStatusHandler(event);
    }

    // ============================================
    // Recipe CRUD Routes
    // ============================================

    // Recipe routes: /recipes, /recipes/{recipeId}, /users/{userId}/recipes
    if (path.includes('/recipes') || path.match(/\/users\/[^/]+\/recipes/)) {
      return await recipeHandler(event);
    }

    // ============================================
    // Nutrition Routes
    // ============================================

    // POST /ai/nutrition - Nutrition analysis
    if (method === 'POST' && path.endsWith('/ai/nutrition')) {
      return await nutritionHandler(event);
    }

    // ============================================
    // Dictionary Routes
    // ============================================

    // GET /dictionary/{ingredient} - Ingredient lookup
    if (method === 'GET' && path.includes('/dictionary/')) {
      return await lookupHandler(event);
    }

    // NOTE: POST /dictionary removed - no frontend usage for adding ingredients
    // if (method === 'POST' && path.endsWith('/dictionary')) {
    //   return await addDictionaryEntry(event);
    // }

    // ============================================
    // Unknown Route
    // ============================================

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${method} ${path}`,
        },
      }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      }),
    };
  }
};
