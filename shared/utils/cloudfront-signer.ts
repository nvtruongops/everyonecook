/**
 * CloudFront Signed URL Generator
 *
 * This utility provides functions to generate CloudFront signed URLs for private content.
 * It uses AWS Secrets Manager to retrieve the private key and caches it for performance.
 *
 * Task 2.2.3: Configure CloudFront signed URLs for private content
 *
 * Usage:
 *   import { generateSignedUrl, generateSignedUrlForPath } from '@shared/utils/cloudfront-signer';
 *
 *   // Generate signed URL for a full URL
 *   const signedUrl = await generateSignedUrl('https://cdn-dev.everyonecook.cloud/avatars/user123/avatar.jpg');
 *
 *   // Generate signed URL for a path (automatically adds domain)
 *   const signedUrl = await generateSignedUrlForPath('/avatars/user123/avatar.jpg');
 *
 * @see .kiro/specs/project-restructure/storage-architecture.md - CloudFront Signed URLs
 * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security)
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

// Configuration from environment variables
const REGION = process.env.AWS_REGION || 'us-east-1';
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || `cdn-${ENVIRONMENT}.everyonecook.cloud`;
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID || '';
const SECRET_NAME = `everyonecook/${ENVIRONMENT}/cloudfront-private-key`;

// Cache for private key (to avoid repeated Secrets Manager calls)
let privateKeyCache: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Retrieve private key from AWS Secrets Manager with caching
 *
 * The private key is cached for 1 hour to reduce Secrets Manager API calls.
 * This is safe because the key is only used for signing and doesn't change frequently.
 *
 * @returns Private key in PEM format
 * @throws Error if private key cannot be retrieved
 */
async function getPrivateKey(): Promise<string> {
  // Return cached key if still valid
  const now = Date.now();
  if (privateKeyCache && now - cacheTimestamp < CACHE_TTL) {
    return privateKeyCache;
  }

  // Retrieve from Secrets Manager
  const client = new SecretsManagerClient({ region: REGION });
  const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });

  try {
    const response = await client.send(command);
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    // Cache the key
    privateKeyCache = response.SecretString;
    cacheTimestamp = now;

    return privateKeyCache;
  } catch (error) {
    console.error('Failed to retrieve CloudFront private key from Secrets Manager:', error);
    throw new Error(
      `Failed to retrieve CloudFront private key: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate a CloudFront signed URL for private content
 *
 * This function generates a signed URL that grants temporary access to private content
 * stored in S3 and served through CloudFront. The URL expires after the specified duration.
 *
 * @param url - Full URL to sign (e.g., 'https://cdn-dev.everyonecook.cloud/avatars/user123/avatar.jpg')
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL with query parameters for authentication
 * @throws Error if signing fails or configuration is invalid
 *
 * @example
 * ```typescript
 * const signedUrl = await generateSignedUrl(
 *   'https://cdn-dev.everyonecook.cloud/avatars/user123/avatar.jpg',
 *   3600
 * );
 * ```
 */
export async function generateSignedUrl(url: string, expiresIn: number = 3600): Promise<string> {
  // Validate configuration
  if (!CLOUDFRONT_KEY_PAIR_ID) {
    throw new Error(
      'CLOUDFRONT_KEY_PAIR_ID environment variable is not set. ' +
        'This should be set from CloudFormation outputs.'
    );
  }

  // Get private key (from cache or Secrets Manager)
  const privateKey = await getPrivateKey();

  // Calculate expiration time
  const dateLessThan = new Date(Date.now() + expiresIn * 1000).toISOString();

  try {
    // Generate signed URL using AWS SDK
    const signedUrl = getSignedUrl({
      url,
      keyPairId: CLOUDFRONT_KEY_PAIR_ID,
      privateKey,
      dateLessThan,
    });

    return signedUrl;
  } catch (error) {
    console.error('Failed to generate CloudFront signed URL:', error);
    throw new Error(
      `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate a CloudFront signed URL for a path (automatically adds domain)
 *
 * This is a convenience function that automatically prepends the CloudFront domain
 * to the path before generating the signed URL.
 *
 * @param path - Path to sign (e.g., '/avatars/user123/avatar.jpg')
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL with query parameters for authentication
 * @throws Error if signing fails or configuration is invalid
 *
 * @example
 * ```typescript
 * const signedUrl = await generateSignedUrlForPath('/avatars/user123/avatar.jpg', 3600);
 * ```
 */
export async function generateSignedUrlForPath(
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Construct full URL
  const url = `https://${CLOUDFRONT_DOMAIN}${normalizedPath}`;

  // Generate signed URL
  return generateSignedUrl(url, expiresIn);
}

/**
 * Generate signed URLs for multiple paths in batch
 *
 * This function generates signed URLs for multiple paths efficiently by reusing
 * the cached private key. Useful for generating signed URLs for multiple images
 * in a post or recipe.
 *
 * @param paths - Array of paths to sign
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Array of signed URLs in the same order as input paths
 * @throws Error if signing fails or configuration is invalid
 *
 * @example
 * ```typescript
 * const paths = [
 *   '/avatars/user123/avatar.jpg',
 *   '/posts/post456/image1.jpg',
 *   '/posts/post456/image2.jpg'
 * ];
 * const signedUrls = await generateSignedUrlsForPaths(paths, 3600);
 * ```
 */
export async function generateSignedUrlsForPaths(
  paths: string[],
  expiresIn: number = 3600
): Promise<string[]> {
  // Validate configuration
  if (!CLOUDFRONT_KEY_PAIR_ID) {
    throw new Error(
      'CLOUDFRONT_KEY_PAIR_ID environment variable is not set. ' +
        'This should be set from CloudFormation outputs.'
    );
  }

  // Get private key once (will be cached)
  const privateKey = await getPrivateKey();

  // Calculate expiration time
  const dateLessThan = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Generate signed URLs for all paths
  const signedUrls = paths.map((path) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `https://${CLOUDFRONT_DOMAIN}${normalizedPath}`;

    try {
      return getSignedUrl({
        url,
        keyPairId: CLOUDFRONT_KEY_PAIR_ID,
        privateKey,
        dateLessThan,
      });
    } catch (error) {
      console.error(`Failed to generate signed URL for path: ${path}`, error);
      throw new Error(
        `Failed to generate signed URL for ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  return signedUrls;
}

/**
 * Check if a path requires a signed URL
 *
 * This function determines if a given path requires a signed URL based on
 * the CloudFront distribution configuration. Private content paths require
 * signed URLs, while public content does not.
 *
 * Private content paths:
 * - /avatars/*
 * - /backgrounds/*
 * - /recipes/* (private recipes)
 *
 * Public content paths:
 * - /posts/* (public posts)
 *
 * @param path - Path to check
 * @returns true if path requires signed URL, false otherwise
 *
 * @example
 * ```typescript
 * if (requiresSignedUrl('/avatars/user123/avatar.jpg')) {
 *   const signedUrl = await generateSignedUrlForPath('/avatars/user123/avatar.jpg');
 * }
 * ```
 */
export function requiresSignedUrl(path: string): boolean {
  const privateContentPaths = ['/avatars/', '/backgrounds/', '/recipes/'];

  return privateContentPaths.some((prefix) => path.startsWith(prefix));
}

/**
 * Clear the private key cache
 *
 * This function clears the cached private key, forcing the next call to
 * retrieve it from Secrets Manager. Useful for testing or when the key
 * has been rotated.
 */
export function clearPrivateKeyCache(): void {
  privateKeyCache = null;
  cacheTimestamp = 0;
}
