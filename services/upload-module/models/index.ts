/**
 * Upload Models - Export all type definitions and interfaces
 */

// Export presigned URL models
export type { FileType, PresignedUrlRequest, PresignedUrlResponse } from './presigned-url.model';

// Export confirmation models
export type {
  FileConfirmationRequest,
  FileConfirmationResponse,
  FileMetadata,
  ImageProcessingMessage,
  ImageOperation,
} from './confirmation.model';

// Export ErrorResponse from presigned-url.model only (avoid duplicate)
export type { ErrorResponse } from './presigned-url.model';

// export * from './upload-request.model';
// export * from './upload-limits.model';
