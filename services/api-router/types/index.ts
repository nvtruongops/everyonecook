/**
 * Shared Type Definitions
 *
 * Common types used across the API Router Lambda.
 *
 * @module types
 */

/**
 * JWT token payload from Cognito
 */
export interface CognitoTokenPayload {
  sub: string; // User ID
  email: string;
  email_verified: boolean;
  'cognito:username': string;
  'cognito:groups'?: string[];
  iat: number; // Issued at
  exp: number; // Expiration
  iss: string; // Issuer
  aud: string; // Audience
}

/**
 * Authenticated user context
 */
export interface UserContext {
  userId: string;
  username: string;
  email: string;
  groups: string[];
}

/**
 * Request context with correlation ID and user info
 */
export interface RequestContext {
  correlationId: string;
  user?: UserContext;
  requestId: string;
  timestamp: string;
}

/**
 * Route definition
 */
export interface Route {
  method: string;
  pathPattern: string;
  handler: string;
  requiresAuth: boolean;
}

/**
 * Lambda invocation payload for downstream handlers
 */
export interface HandlerInvocationPayload {
  method: string;
  path: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  headers: Record<string, string>;
  body?: string;
  requestContext: RequestContext;
}
