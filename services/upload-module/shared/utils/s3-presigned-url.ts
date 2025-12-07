/**
 * S3 Presigned URL Utility (Shared)
 *
 * Provides S3 presigned URL generation for secure file uploads.
 * Can be used across all modules (auth, upload, social, recipe, etc.)
 *
 * @module shared/utils/s3-presigned-url
 * @see .kiro/specs/project-restructure/storage-architecture.md - Upload Workflow
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

// Environment variables
const CONTENT_BUCKET = process.env.CONTENT_BUCKET || '';
const CDN_DOMAIN = process.env.CDN_DOMAIN || 'cdn.everyonecook.cloud';

/**
 * File type configuration
 */
export interface FileTypeConfig {
  allowedTypes: string[];
  maxSizeBytes: number;
  folder: string;
}

/**
 * Presigned URL result
 */
export interface PresignedUrlResult {
  uploadUrl: string;
  fileKey: string;
  cdnUrl: string;
  expiresIn: number;
}

/**
 * Common file type configurations
 */
export const FILE_TYPES = {
  AVATAR: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    folder: 'avatars',
  },
  BACKGROUND: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    folder: 'backgrounds',
  },
  POST_IMAGE: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    folder: 'posts',
  },
  RECIPE_IMAGE: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    folder: 'recipes',
  },
};

/**
 * Validate file type and size
 *
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @param config - File type configuration
 * @throws Error if validation fails
 */
export function validateFile(contentType: string, fileSize: number, config: FileTypeConfig): void {
  // Validate content type
  if (!config.allowedTypes.includes(contentType)) {
    throw new Error(`Invalid file type. Allowed types: ${config.allowedTypes.join(', ')}`);
  }

  // Validate file size
  if (fileSize > config.maxSizeBytes) {
    const maxSizeMB = config.maxSizeBytes / (1024 * 1024);
    throw new Error(`File size exceeds maximum allowed size of ${maxSizeMB} MB`);
  }
}

/**
 * Generate unique file key with timestamp
 *
 * @param userId - User ID
 * @param folder - S3 folder (e.g., 'avatars', 'posts')
 * @param fileName - Original file name
 * @param subFolder - Optional sub-folder (e.g., postId, recipeId)
 * @returns Unique S3 key
 */
export function generateFileKey(
  userId: string,
  folder: string,
  fileName: string,
  subFolder?: string
): string {
  const timestamp = Date.now();
  const extension = fileName.split('.').pop() || 'jpg';
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

  if (subFolder) {
    return `${folder}/${userId}/${subFolder}/${sanitizedName}-${timestamp}.${extension}`;
  }

  return `${folder}/${userId}/${sanitizedName}-${timestamp}.${extension}`;
}

/**
 * Generate presigned URL for S3 upload
 *
 * @param userId - User ID
 * @param fileName - Original file name
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @param config - File type configuration
 * @param subFolder - Optional sub-folder (e.g., postId, recipeId)
 * @param expiresIn - URL expiration in seconds (default: 300 = 5 minutes)
 * @returns Presigned URL result
 */
export async function generatePresignedUrl(
  userId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
  config: FileTypeConfig,
  subFolder?: string,
  expiresIn: number = 300
): Promise<PresignedUrlResult> {
  // Validate file
  validateFile(contentType, fileSize, config);

  // Generate unique file key
  const fileKey = generateFileKey(userId, config.folder, fileName, subFolder);

  // Create PutObject command
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: fileKey,
    ContentType: contentType,
    ContentLength: fileSize,
    Metadata: {
      userId,
      uploadedAt: Date.now().toString(),
    },
  });

  // Generate presigned URL
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  // Generate CDN URL
  const cdnUrl = `https://${CDN_DOMAIN}/${fileKey}`;

  return {
    uploadUrl,
    fileKey,
    cdnUrl,
    expiresIn,
  };
}

/**
 * Generate presigned URL for avatar upload
 *
 * @param userId - User ID
 * @param fileName - Original file name
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @returns Presigned URL result
 */
export async function generateAvatarUploadUrl(
  userId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<PresignedUrlResult> {
  return generatePresignedUrl(userId, fileName, contentType, fileSize, FILE_TYPES.AVATAR);
}

/**
 * Generate presigned URL for background upload
 *
 * @param userId - User ID
 * @param fileName - Original file name
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @returns Presigned URL result
 */
export async function generateBackgroundUploadUrl(
  userId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<PresignedUrlResult> {
  return generatePresignedUrl(userId, fileName, contentType, fileSize, FILE_TYPES.BACKGROUND);
}

/**
 * Generate presigned URL for post image upload
 *
 * @param userId - User ID
 * @param postId - Post ID
 * @param fileName - Original file name
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @returns Presigned URL result
 */
export async function generatePostImageUploadUrl(
  userId: string,
  postId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<PresignedUrlResult> {
  return generatePresignedUrl(
    userId,
    fileName,
    contentType,
    fileSize,
    FILE_TYPES.POST_IMAGE,
    postId
  );
}

/**
 * Generate presigned URL for recipe image upload
 *
 * @param userId - User ID
 * @param recipeId - Recipe ID
 * @param fileName - Original file name
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @returns Presigned URL result
 */
export async function generateRecipeImageUploadUrl(
  userId: string,
  recipeId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<PresignedUrlResult> {
  return generatePresignedUrl(
    userId,
    fileName,
    contentType,
    fileSize,
    FILE_TYPES.RECIPE_IMAGE,
    recipeId
  );
}
