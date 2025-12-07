/**
 * Presigned URL Models
 *
 * Type definitions for presigned URL generation requests and responses
 */

/**
 * File type for upload
 */
export type FileType = 'avatar' | 'background' | 'post' | 'recipe';

/**
 * Request to generate presigned URL
 */
export interface PresignedUrlRequest {
  fileType: FileType;
  fileName: string;
  contentType: string;
  fileSize: number;
  subFolder?: string; // For post/recipe images (postId, recipeId)
}

/**
 * Response with presigned URL
 */
export interface PresignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
  cdnUrl: string;
  expiresIn: number;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
