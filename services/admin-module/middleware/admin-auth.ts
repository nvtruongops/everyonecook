/**
 * Admin Authorization Middleware
 *
 * Validates that the requesting user has Admin role in Cognito User Pool.
 * Checks JWT claims for 'cognito:groups' and verifies 'Admin' membership.
 * 
 * Supports multiple authentication methods:
 * 1. Admin API Key (for scripts/testing)
 * 2. JWT Token decoding (for FE admin panel)
 * 3. Cognito Authorizer claims (fallback)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

export class UnauthorizedError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 403;
    this.code = 'ADMIN_UNAUTHORIZED';
  }
}

/**
 * Decode JWT token payload (without verification - Cognito Authorizer already verified)
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Extract groups from JWT token or authorizer claims
 */
function extractGroups(event: APIGatewayProxyEvent): string[] {
  // Method 1: Try to get from authorizer claims (if Cognito Authorizer forwards them)
  const authorizerGroups = event.requestContext?.authorizer?.claims?.['cognito:groups'];
  if (authorizerGroups) {
    if (typeof authorizerGroups === 'string') {
      return authorizerGroups.split(',').map((g) => g.trim());
    }
    if (Array.isArray(authorizerGroups)) {
      return authorizerGroups;
    }
  }

  // Method 2: Decode JWT token directly from Authorization header
  const authHeader = event.headers?.['Authorization'] || event.headers?.['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const payload = decodeJwtPayload(token);
    if (payload) {
      const groups = payload['cognito:groups'];
      if (Array.isArray(groups)) {
        return groups;
      }
      if (typeof groups === 'string') {
        return groups.split(',').map((g) => g.trim());
      }
    }
  }

  return [];
}

/**
 * Extract user ID from JWT token or authorizer claims
 */
function extractUserId(event: APIGatewayProxyEvent): string | null {
  // Method 1: Try authorizer claims
  const sub = event.requestContext?.authorizer?.claims?.sub;
  if (sub) return sub;

  // Method 2: Decode JWT token
  const authHeader = event.headers?.['Authorization'] || event.headers?.['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const payload = decodeJwtPayload(token);
    if (payload?.sub) return payload.sub;
  }

  return null;
}

/**
 * Require Admin Role
 *
 * Validates that the user has Admin group membership in Cognito,
 * or has valid admin API key for direct Lambda invocation.
 * Throws UnauthorizedError if not admin.
 *
 * @param event - API Gateway event with authorizer context
 * @throws UnauthorizedError if user is not admin
 */
export function requireAdminRole(event: APIGatewayProxyEvent): void {
  // Check for admin API key (for direct Lambda invocation / testing)
  const adminKey = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
  const expectedKey = process.env.ADMIN_API_KEY || 'everyonecook-admin-2024-secure-key';

  if (adminKey && adminKey === expectedKey) {
    // Valid admin API key - allow access
    return;
  }

  // Extract groups from JWT token or authorizer claims
  const groupList = extractGroups(event);

  // Check if Admin group exists (case-insensitive)
  const hasAdminRole = groupList.some((g) => g.toLowerCase() === 'admin');
  if (!hasAdminRole) {
    throw new UnauthorizedError('Admin role required for this operation');
  }
}

/**
 * Get Admin User ID
 *
 * Extracts the admin user ID from the JWT claims or token.
 *
 * @param event - API Gateway event with authorizer context
 * @returns Admin user ID (sub claim)
 */
export function getAdminUserId(event: APIGatewayProxyEvent): string {
  const sub = extractUserId(event);

  if (!sub) {
    throw new UnauthorizedError('Invalid JWT token - missing sub claim');
  }

  return sub;
}

/**
 * Get Request IP Address
 *
 * Extracts the client IP address from the request.
 *
 * @param event - API Gateway event
 * @returns Client IP address
 */
export function getRequestIP(event: APIGatewayProxyEvent): string {
  // Check X-Forwarded-For header first (CloudFront/ALB)
  const forwardedFor = event.headers['X-Forwarded-For'] || event.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Take first IP in the chain
    return forwardedFor.split(',')[0].trim();
  }

  // Fallback to source IP
  return event.requestContext.identity.sourceIp || 'unknown';
}

/**
 * Check if user is admin (non-throwing version)
 *
 * @param event - API Gateway event with authorizer context
 * @returns true if user is admin, false otherwise
 */
export function isAdminUser(event: APIGatewayProxyEvent): boolean {
  try {
    // Check for admin API key
    const adminKey = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
    const expectedKey = process.env.ADMIN_API_KEY || 'everyonecook-admin-2024-secure-key';

    if (adminKey && adminKey === expectedKey) {
      return true;
    }

    // Extract groups from JWT token or authorizer claims
    const groupList = extractGroups(event);

    // Check if Admin group exists
    return groupList.some((g) => g.toLowerCase() === 'admin');
  } catch {
    return false;
  }
}
