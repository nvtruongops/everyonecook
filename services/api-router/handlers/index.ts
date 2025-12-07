/**
 * API Router Lambda Handler
 *
 * Entry point for all API requests. Implements the API Router pattern:
 * - JWT validation
 * - Request routing
 * - Correlation ID generation
 * - Error handling
 * - Structured logging
 *
 * @module handlers/index
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalServerErrorResponse,
} from '../utils/response';
import { extractToken, validateToken } from '../utils/jwt';
import { routeRequest, isRoutePublic } from '../utils/router';
import { invokeLambda, validateLambdaConfiguration } from '../utils/lambda-invoker';

/**
 * Extracts or generates correlation ID for request tracing
 *
 * @param event - API Gateway proxy event
 * @returns Correlation ID
 */
const getCorrelationId = (event: APIGatewayProxyEvent): string => {
  // Check for existing correlation ID in headers
  const headers = event.headers || {};
  const correlationId =
    headers['X-Correlation-ID'] ||
    headers['x-correlation-id'] ||
    headers['X-Request-ID'] ||
    headers['x-request-id'];

  // Generate new correlation ID if not provided
  return correlationId || uuidv4();
};

/**
 * Validates JWT token from Authorization header
 *
 * @param event - API Gateway proxy event
 * @param logger - Logger instance
 * @returns Decoded token payload or null if validation fails
 */
const validateAuthToken = async (event: APIGatewayProxyEvent, logger: any): Promise<any | null> => {
  try {
    // Extract token from Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const token = extractToken(authHeader);

    // Validate token
    logger.info('Validating JWT token');
    const decodedToken = await validateToken(token);

    logger.info('JWT token validated successfully', {
      userId: decodedToken.sub,
      username: decodedToken['cognito:username'],
    });

    return decodedToken;
  } catch (error) {
    logger.warn('JWT token validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
};

/**
 * Checks if the route requires authentication
 *
 * Uses route definitions from api-routes.ts to determine if auth is required.
 * Falls back to requiring auth for unknown routes.
 *
 * @param path - Request path
 * @param method - HTTP method
 * @returns True if authentication is required
 */
const requiresAuth = (path: string, method: string): boolean => {
  // CORS preflight never requires auth
  if (method === 'OPTIONS') {
    return false;
  }

  // Strip /api stage prefix if present for route matching
  let normalizedPath = path;
  if (normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.substring(4);
  } else if (normalizedPath === '/api') {
    normalizedPath = '/';
  }

  // Health check endpoints
  if (normalizedPath === '/health' || normalizedPath === '/status') {
    return false;
  }

  // Check route definitions for requiresAuth flag
  const isPublic = isRoutePublic(method, normalizedPath);
  if (isPublic) {
    return false;
  }

  // Default: require authentication
  return true;
};

/**
 * Main Lambda handler function
 *
 * Implements the API Router pattern:
 * 1. Extract/generate correlation ID
 * 2. Initialize structured logging
 * 3. Validate JWT token (if required)
 * 4. Route request to appropriate handler
 * 5. Handle errors consistently
 * 6. Return formatted response
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda execution context
 * @returns API Gateway proxy result
 */
// Validate Lambda configuration on cold start
let configValidated = false;

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  // Step 1: Extract or generate correlation ID
  const correlationId = getCorrelationId(event);

  // Step 2: Initialize structured logger
  const logger = createLogger('api-router', correlationId);

  try {
    // Validate Lambda configuration on first invocation
    if (!configValidated) {
      try {
        validateLambdaConfiguration();
        configValidated = true;
        logger.info('Lambda configuration validated successfully');
      } catch (error) {
        logger.error(
          'Lambda configuration validation failed',
          error instanceof Error ? error : new Error('Unknown error')
        );
        // Continue anyway - will fail on actual invocation if ARN missing
      }
    }

    // Log incoming request
    logger.info('Incoming API request', {
      method: event.httpMethod,
      path: event.path,
      requestId: context.awsRequestId,
      sourceIp: event.requestContext.identity.sourceIp,
    });

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
      logger.info('Handling CORS preflight request');
      return successResponse({ message: 'CORS preflight successful' }, 200, correlationId);
    }

    // Step 3: Validate JWT token (if required or provided)
    let decodedToken = null;
    const authHeader = event.headers?.Authorization || event.headers?.authorization;

    if (requiresAuth(event.path, event.httpMethod)) {
      // Route requires auth - must have valid token
      decodedToken = await validateAuthToken(event, logger);

      if (!decodedToken) {
        logger.warn('Authentication required but token validation failed');
        return unauthorizedResponse('Invalid or missing authentication token', correlationId);
      }
    } else if (authHeader) {
      // Route is public but token provided - validate it for relationship detection
      // This allows privacy filtering to work correctly for logged-in users viewing public profiles
      decodedToken = await validateAuthToken(event, logger);
      if (decodedToken) {
        logger.info('Optional auth token validated for public route', {
          userId: decodedToken.sub,
        });
      }
      // Don't fail if token is invalid - just treat as anonymous
    }

    // Step 4: Route request to appropriate handler
    try {
      // Strip /api stage prefix if present (API Gateway adds stage name to path)
      // e.g., /api/ai/nutrition → /ai/nutrition
      let routePath = event.path;
      if (routePath.startsWith('/api/')) {
        routePath = routePath.substring(4); // Remove '/api' prefix, keep leading '/'
      } else if (routePath === '/api') {
        routePath = '/';
      }

      const handlerName = routeRequest(event.httpMethod, routePath);
      logger.info('Request routed successfully', {
        handler: handlerName,
        method: event.httpMethod,
        path: event.path,
        routePath,
      });

      // Step 5: Invoke target Lambda function
      logger.info('Invoking target Lambda', {
        handler: handlerName,
      });

      const result = await invokeLambda(handlerName, event, decodedToken);

      const duration = Date.now() - startTime;
      logger.info('Request completed successfully', {
        duration,
        handler: handlerName,
        statusCode: result.statusCode,
      });

      // Add correlation ID to response headers if not already present
      if (!result.headers?.['X-Correlation-ID'] && !result.headers?.['x-correlation-id']) {
        result.headers = {
          ...result.headers,
          'X-Correlation-ID': correlationId,
        };
      }

      return result;
    } catch (routingError) {
      // Route not found
      logger.warn('No matching route found', {
        method: event.httpMethod,
        path: event.path,
        error: routingError instanceof Error ? routingError.message : 'Unknown error',
      });

      return notFoundResponse(
        `No handler found for ${event.httpMethod} ${event.path}`,
        correlationId
      );
    }
  } catch (error) {
    // Step 5: Handle unexpected errors
    const duration = Date.now() - startTime;
    logger.error(
      'Unexpected error in API Router',
      error instanceof Error ? error : new Error('Unknown error'),
      {
        duration,
        method: event.httpMethod,
        path: event.path,
      }
    );

    return internalServerErrorResponse(
      'An unexpected error occurred',
      correlationId,
      process.env.NODE_ENV === 'development'
        ? { error: error instanceof Error ? error.message : 'Unknown error' }
        : undefined
    );
  }
};
