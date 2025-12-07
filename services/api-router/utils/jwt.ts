/**
 * JWT Validation Utilities
 *
 * Handles JWT token validation for Cognito User Pool tokens.
 * Validates token signature, expiration, and claims.
 *
 * @module utils/jwt
 */

import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';
// AWS_REGION is automatically provided by Lambda runtime
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';

// Cognito JWKS endpoint
const JWKS_URI = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;

// Initialize JWKS client
const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

/**
 * Get signing key from Cognito JWKS endpoint
 *
 * @param header - JWT header containing 'kid' (key ID)
 * @returns Signing key for token verification
 */
const getSigningKey = (header: jwt.JwtHeader): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!header.kid) {
      return reject(new Error('Token header missing kid'));
    }

    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        return reject(err);
      }
      const signingKey = key?.getPublicKey();
      if (!signingKey) {
        return reject(new Error('Unable to get signing key'));
      }
      resolve(signingKey);
    });
  });
};

/**
 * Validates a JWT token from Cognito
 *
 * Implementation:
 * - Verifies token signature using Cognito public keys (RS256 algorithm)
 * - Checks token expiration
 * - Validates issuer (Cognito User Pool)
 * - Validates audience (User Pool Client ID)
 * - Extracts user claims (sub, username, email, etc.)
 *
 * @param token - JWT token from Authorization header
 * @returns Decoded token payload with user claims
 * @throws Error if token is invalid, expired, or malformed
 *
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html
 */
export const validateToken = async (token: string): Promise<any> => {
  try {
    // Step 1: Decode JWT header to get 'kid' (key ID)
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === 'string') {
      throw new Error('Invalid token format');
    }

    // Step 2: Download corresponding public key from Cognito
    const signingKey = await getSigningKey(decodedHeader.header);

    // Step 3: Verify token signature with RS256 algorithm
    // Note: Access tokens don't have 'aud' claim, only ID tokens do
    // We validate 'client_id' claim for access tokens instead
    const decoded = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
      // Don't validate audience for access tokens
    }) as any;

    // Validate client_id for access tokens (token_use: 'access')
    if (decoded.token_use === 'access' && decoded.client_id !== USER_POOL_CLIENT_ID) {
      throw new Error('Invalid client_id in access token');
    }

    // Validate audience for ID tokens (token_use: 'id')
    if (decoded.token_use === 'id' && decoded.aud !== USER_POOL_CLIENT_ID) {
      throw new Error('Invalid audience in ID token');
    }

    // Step 4: Validate claims (issuer, audience, expiration)
    // jwt.verify() already validates exp, iss, aud
    // Additional validation can be added here if needed

    // Step 5: Return decoded token payload
    return decoded;
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    } else if (error instanceof Error) {
      throw new Error(`Token validation failed: ${error.message}`);
    } else {
      throw new Error('Token validation failed: Unknown error');
    }
  }
};

/**
 * Extracts JWT token from Authorization header
 *
 * @param authHeader - Authorization header value (e.g., "Bearer <token>")
 * @returns JWT token string
 * @throws Error if header format is invalid
 */
export const extractToken = (authHeader: string | undefined): string => {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid Authorization header format');
  }

  return parts[1];
};
