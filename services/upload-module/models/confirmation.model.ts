/**
 * File Confirmation Models
 *
 * Type definitions for file upload confirmation requests and responses
 */

/**
 * Request to confirm file upload
 */
export interface FileConfirmationRequest {
  fileKey: string;
  fileType: 'avatar' | 'background' | 'post' | 'recipe';
  subFolder?: string; // For post/recipe images (postId, recipeId)
}

/**
 * Response after file confirmation
 */
export interface FileConfirmationResponse {
  success: boolean;
  fileKey: string;
  cdnUrl: string;
  metadata: FileMetadata;
  processingQueued?: boolean; // True if image processing was queued
}

/**
 * File metadata stored in DynamoDB
 */
export interface FileMetadata {
  fileKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: number;
  cdnUrl: string;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
}

/**
 * Image processing message for SQS
 */
export interface ImageProcessingMessage {
  fileKey: string;
  userId: string;
  fileType: 'avatar' | 'background' | 'post' | 'recipe';
  contentType: string;
  operations: ImageOperation[];
  timestamp: number;
}

/**
 * Image processing operations
 */
export interface ImageOperation {
  type: 'resize' | 'compress' | 'thumbnail' | 'watermark';
  params: Record<string, unknown>;
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
