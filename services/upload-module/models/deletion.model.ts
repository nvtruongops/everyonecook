/**
 * File Deletion Models
 *
 * Type definitions for file deletion requests and responses
 */

/**
 * Request to delete a file
 */
export interface FileDeletionRequest {
  fileKey: string;
  fileType: 'avatar' | 'background' | 'post' | 'recipe';
  subFolder?: string; // For post/recipe images (postId, recipeId)
  softDelete?: boolean; // If true, mark as deleted instead of removing
}

/**
 * Response after file deletion
 */
export interface FileDeletionResponse {
  success: boolean;
  fileKey: string;
  deletedAt: number;
  softDeleted?: boolean;
}

/**
 * Soft delete metadata
 */
export interface SoftDeleteMetadata {
  deletedAt: number;
  deletedBy: string;
  originalStatus: string;
  canRecover: boolean;
  recoveryExpiresAt: number; // 30 days from deletion
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
