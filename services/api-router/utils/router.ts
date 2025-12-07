/**
 * Request Routing Utilities
 *
 * Routes incoming requests to appropriate handler Lambda functions
 * based on HTTP method and path pattern.
 *
 * Uses shared route definitions from @everyonecook/shared/routes
 * for consistency across backend, frontend, and infrastructure.
 *
 * @module utils/router
 */

import { API_ROUTES, RouteDefinition } from '../routes/api-routes';

/**
 * Route configuration mapping paths to handler Lambda ARNs
 */
export interface RouteConfig {
  method: string;
  path: string;
  handler: string; // Lambda function ARN or name
}

/**
 * Route table - Generated from shared route definitions
 *
 * This ensures consistency between:
 * - Backend routing logic
 * - Frontend API client
 * - Infrastructure API Gateway resources
 */
const ROUTE_TABLE: RouteConfig[] = API_ROUTES.map((route: RouteDefinition) => ({
  method: route.method,
  path: route.path,
  handler: route.handler,
}));

/**
 * Legacy route table - REMOVED
 * All routes now managed in shared/routes/api-routes.ts
 * Copied to services/api-router/routes/api-routes.ts during build
 */

/**
 * Routes a request to the appropriate handler Lambda
 *
 * Matches the HTTP method and path against the route table.
 * Supports path parameters using curly braces: /users/{userId}
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param path - Request path
 * @returns Handler Lambda ARN or name
 * @throws Error if no matching route found
 */
export const routeRequest = (method: string, path: string): string => {
  // Normalize method to uppercase
  const normalizedMethod = method.toUpperCase();

  // Find matching route
  for (const route of ROUTE_TABLE) {
    if (route.method === normalizedMethod && matchPath(route.path, path)) {
      return route.handler;
    }
  }

  // No matching route found
  throw new Error(`No route found for ${method} ${path}`);
};

/**
 * Checks if a route is public (doesn't require authentication)
 *
 * @param method - HTTP method
 * @param path - Request path
 * @returns True if route is public (requiresAuth: false)
 */
export const isRoutePublic = (method: string, path: string): boolean => {
  const normalizedMethod = method.toUpperCase();

  // Find matching route in API_ROUTES (which has requiresAuth flag)
  for (const route of API_ROUTES) {
    if (route.method === normalizedMethod && matchPath(route.path, path)) {
      // Return true if route explicitly doesn't require auth
      return route.requiresAuth === false;
    }
  }

  // Default: not public (requires auth)
  return false;
};

/**
 * Matches a path against a route pattern
 * Supports path parameters like /users/{userId}
 *
 * Examples:
 * - matchPath("/users/{userId}", "/users/123") => true
 * - matchPath("/users/{userId}", "/users/123/posts") => false
 * - matchPath("/posts", "/posts") => true
 *
 * @param pattern - Route pattern (e.g., "/users/{userId}")
 * @param path - Actual request path (e.g., "/users/123")
 * @returns True if path matches pattern
 */
export const matchPath = (pattern: string, path: string): boolean => {
  // Split paths into segments
  const patternSegments = pattern.split('/').filter((s) => s.length > 0);
  const pathSegments = path.split('/').filter((s) => s.length > 0);

  // Must have same number of segments
  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  // Check each segment
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i];
    const pathSegment = pathSegments[i];

    // If pattern segment is a parameter (e.g., {userId}), it matches any value
    if (patternSegment.startsWith('{') && patternSegment.endsWith('}')) {
      continue;
    }

    // Otherwise, segments must match exactly
    if (patternSegment !== pathSegment) {
      return false;
    }
  }

  return true;
};

/**
 * Extracts path parameters from a matched route
 *
 * Examples:
 * - extractPathParams("/users/{userId}", "/users/123") => { userId: "123" }
 * - extractPathParams("/posts/{postId}/comments/{commentId}", "/posts/456/comments/789")
 *   => { postId: "456", commentId: "789" }
 *
 * @param pattern - Route pattern (e.g., "/users/{userId}")
 * @param path - Actual request path (e.g., "/users/123")
 * @returns Object with extracted parameters
 */
export const extractPathParams = (pattern: string, path: string): Record<string, string> => {
  const params: Record<string, string> = {};

  // Split paths into segments
  const patternSegments = pattern.split('/').filter((s) => s.length > 0);
  const pathSegments = path.split('/').filter((s) => s.length > 0);

  // Extract parameters
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i];
    const pathSegment = pathSegments[i];

    // If pattern segment is a parameter, extract it
    if (patternSegment.startsWith('{') && patternSegment.endsWith('}')) {
      const paramName = patternSegment.slice(1, -1); // Remove { and }
      params[paramName] = pathSegment;
    }
  }

  return params;
};
