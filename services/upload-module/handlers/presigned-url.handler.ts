/**
 * Presigned URL Handler
 *
 * Generates secure, time-limited presigned URLs for file uploads with validation and rate limiting.
 *
 * @module upload-module/handlers/presigned-url
 * @see .kiro/specs/project-restructure/storage-architecture.md - Presigned URLs
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  generateAvatarUploadUrl,
  generateBackgroundUploadUrl,
  generatePostImageUploadUrl,
  generateRecipeImageUploadUrl,
} from '../shared/utils/s3-presigned-url';
import { checkRateLimit, RATE_LIMITS } from '../shared/utils/rate-limiter';
import {
  PresignedUrlRequest,
  PresignedUrlResponse,
  ErrorResponse,
} from '../models/presigned-url.model';

/**
 * Lambda handler for generating presigned URLs
 *
 * @param event - API Gateway event
 * @returns API Gateway response with presigned URL or error
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract user ID from authorizer context
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Parse request body
    const request = parseRequest(event.body);

    // Validate request
    validateRequest(request);

    // Check rate limit based on file type
    const rateLimitExceeded = await checkUploadRateLimit(userId, request.fileType);
    if (rateLimitExceeded) {
      return createErrorResponse(
        429,
        'RATE_LIMIT_EXCEEDED',
        `Upload limit exceeded for ${request.fileType}. Maximum 10 uploads per day.`
      );
    }

    // Generate presigned URL based on file type
    const result = await generatePresignedUrlByType(userId, request);

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        uploadUrl: result.uploadUrl,
        fileKey: result.fileKey,
        cdnUrl: result.cdnUrl,
        expiresIn: result.expiresIn,
      } as PresignedUrlResponse),
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);

    if (error instanceof Error) {
      // Handle validation errors
      if (
        error.message.includes('Invalid') ||
        error.message.includes('exceeds') ||
        error.message.includes('required') ||
        error.message.includes('must be')
      ) {
        return createErrorResponse(400, 'VALIDATION_ERROR', error.message);
      }
    }

    // Handle unexpected errors
    return createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to generate presigned URL');
  }
}

/**
 * Parse request body
 *
 * @param body - Request body string
 * @returns Parsed request
 */
function parseRequest(body: string | null): PresignedUrlRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  try {
    return JSON.parse(body) as PresignedUrlRequest;
  } catch {
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Validate presigned URL request
 *
 * @param request - Presigned URL request
 * @throws Error if validation fails
 */
function validateRequest(request: PresignedUrlRequest): void {
  // Validate file type
  const validFileTypes: string[] = ['avatar', 'background', 'post', 'recipe'];
  if (!validFileTypes.includes(request.fileType)) {
    throw new Error(`Invalid file type. Must be one of: ${validFileTypes.join(', ')}`);
  }

  // Validate file name
  if (!request.fileName || request.fileName.trim().length === 0) {
    throw new Error('File name is required');
  }

  // Validate content type
  const validContentTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validContentTypes.includes(request.contentType)) {
    throw new Error(`Invalid content type. Allowed types: ${validContentTypes.join(', ')}`);
  }

  // Validate file size
  if (!request.fileSize || request.fileSize <= 0) {
    throw new Error('File size must be greater than 0');
  }

  // Validate sub-folder for post/recipe images
  if ((request.fileType === 'post' || request.fileType === 'recipe') && !request.subFolder) {
    throw new Error(
      `Sub-folder (${request.fileType}Id) is required for ${request.fileType} images`
    );
  }
}

/**
 * Check upload rate limit based on file type
 *
 * @param userId - User ID
 * @param fileType - File type
 * @returns True if rate limit exceeded
 */
async function checkUploadRateLimit(userId: string, fileType: string): Promise<boolean> {
  switch (fileType) {
    case 'avatar':
      return checkRateLimit(userId, RATE_LIMITS.AVATAR_UPLOAD);
    case 'background':
      return checkRateLimit(userId, RATE_LIMITS.BACKGROUND_UPLOAD);
    case 'post':
      return checkRateLimit(userId, RATE_LIMITS.POST_IMAGE_UPLOAD);
    case 'recipe':
      return checkRateLimit(userId, RATE_LIMITS.RECIPE_IMAGE_UPLOAD);
    default:
      return false;
  }
}

/**
 * Generate presigned URL based on file type
 *
 * @param userId - User ID
 * @param request - Presigned URL request
 * @returns Presigned URL result
 */
async function generatePresignedUrlByType(userId: string, request: PresignedUrlRequest) {
  switch (request.fileType) {
    case 'avatar':
      return generateAvatarUploadUrl(
        userId,
        request.fileName,
        request.contentType,
        request.fileSize
      );

    case 'background':
      return generateBackgroundUploadUrl(
        userId,
        request.fileName,
        request.contentType,
        request.fileSize
      );

    case 'post':
      if (!request.subFolder) {
        throw new Error('Post ID is required for post images');
      }
      return generatePostImageUploadUrl(
        userId,
        request.subFolder,
        request.fileName,
        request.contentType,
        request.fileSize
      );

    case 'recipe':
      if (!request.subFolder) {
        throw new Error('Recipe ID is required for recipe images');
      }
      return generateRecipeImageUploadUrl(
        userId,
        request.subFolder,
        request.fileName,
        request.contentType,
        request.fileSize
      );

    default:
      throw new Error(`Unsupported file type: ${request.fileType}`);
  }
}

/**
 * Create error response
 *
 * @param statusCode - HTTP status code
 * @param code - Error code
 * @param message - Error message
 * @returns API Gateway error response
 */
function createErrorResponse(
  statusCode: number,
  code: string,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      error: {
        code,
        message,
      },
    } as ErrorResponse),
  };
}
