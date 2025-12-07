/**
 * Cognito JWT Helper Utilities
 *
 * Provides helper functions to extract user information from Cognito JWT tokens
 * in API Gateway Lambda authorizer context.
 *
 * Schema Migration Note:
 * - DynamoDB now uses username as PK (PK=USER#{username})
 * - userId (Cognito sub) is stored in entity for traceability
 * - All queries must use username, not userId
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Extract userId (Cognito sub) from JWT claims
 *
 * @param event - API Gateway proxy event
 * @returns Cognito user ID (sub)
 * @throws Error if userId not found in claims
 */
export function getUserId(event: APIGatewayProxyEvent): string {
  const userId = event.requestContext.authorizer?.claims?.sub;

  if (!userId) {
    throw new Error('User ID not found in authorizer claims');
  }

  return userId;
}

/**
 * Extract username from JWT claims
 *
 * Schema Migration: Username is now the primary identifier for DynamoDB queries
 * - PK: USER#{username}
 * - Username is normalized to lowercase
 *
 * Note: Cognito Access Token uses 'username' field, ID Token uses 'cognito:username'
 * We check both for compatibility
 *
 * @param event - API Gateway proxy event
 * @returns Normalized username (lowercase)
 * @throws Error if username not found in claims
 */
export function getUsername(event: APIGatewayProxyEvent): string {
  // Check both 'username' (Access Token) and 'cognito:username' (ID Token)
  const username =
    event.requestContext.authorizer?.claims?.username ||
    event.requestContext.authorizer?.claims?.['cognito:username'];

  if (!username) {
    throw new Error('Username not found in authorizer claims');
  }

  // Normalize to lowercase to avoid case-sensitivity issues
  return username.toLowerCase();
}

/**
 * Extract user information (both userId and username) from JWT claims
 *
 * @param event - API Gateway proxy event
 * @returns Object containing userId and username
 * @throws Error if userId or username not found in claims
 */
export function getUserInfo(event: APIGatewayProxyEvent): {
  userId: string;
  username: string;
} {
  const userId = getUserId(event);
  const username = getUsername(event);

  return { userId, username };
}

/**
 * Extract email from JWT claims
 *
 * @param event - API Gateway proxy event
 * @returns User email
 * @throws Error if email not found in claims
 */
export function getUserEmail(event: APIGatewayProxyEvent): string {
  const email = event.requestContext.authorizer?.claims?.email;

  if (!email) {
    throw new Error('Email not found in authorizer claims');
  }

  return email;
}

/**
 * Check if email is verified
 *
 * @param event - API Gateway proxy event
 * @returns True if email is verified, false otherwise
 */
export function isEmailVerified(event: APIGatewayProxyEvent): boolean {
  const emailVerified = event.requestContext.authorizer?.claims?.email_verified;
  return emailVerified === 'true' || emailVerified === true;
}
