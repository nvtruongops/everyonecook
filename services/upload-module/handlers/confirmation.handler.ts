/**
 * File Confirmation Handler
 *
 * Confirms successful file upload, verifies S3 existence, updates DynamoDB metadata,
 * and triggers image processing if needed.
 *
 * @module upload-module/handlers/confirmation
 * @see .kiro/specs/project-restructure/storage-architecture.md - Upload Workflow
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  FileConfirmationRequest,
  FileConfirmationResponse,
  FileMetadata,
  ImageProcessingMessage,
  ErrorResponse,
} from '../models/confirmation.model';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' })
);
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

// Helper functions to get environment variables (allows for testing)
const getContentBucket = () => process.env.CONTENT_BUCKET || '';
const getCdnDomain = () => process.env.CDN_DOMAIN || 'cdn.everyonecook.cloud';
const getDynamoTable = () => process.env.DYNAMODB_TABLE || 'EveryoneCook';
const getImageProcessingQueueUrl = () => process.env.IMAGE_PROCESSING_QUEUE_URL || '';

/**
 * Lambda handler for confirming file upload
 *
 * @param event - API Gateway event
 * @returns API Gateway response with confirmation result
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

    // Verify file exists in S3
    const fileMetadata = await verifyFileInS3(request.fileKey);

    // Verify user owns the file
    verifyFileOwnership(request.fileKey, userId);

    // Update DynamoDB with file metadata
    await updateFileMetadata(userId, request, fileMetadata);

    // Queue image processing if it's an image
    const processingQueued = await queueImageProcessing(userId, request, fileMetadata);

    // Generate CDN URL
    const cdnUrl = `https://${getCdnDomain()}/${request.fileKey}`;

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        fileKey: request.fileKey,
        cdnUrl,
        metadata: {
          fileKey: request.fileKey,
          fileName: extractFileName(request.fileKey),
          contentType: fileMetadata.ContentType || 'application/octet-stream',
          fileSize: fileMetadata.ContentLength || 0,
          uploadedBy: userId,
          uploadedAt: Date.now(),
          cdnUrl,
          status: processingQueued ? 'processing' : 'uploaded',
        },
        processingQueued,
      } as FileConfirmationResponse),
    };
  } catch (error) {
    console.error('Error confirming file upload:', error);

    if (error instanceof Error) {
      // Handle specific errors
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return createErrorResponse(404, 'FILE_NOT_FOUND', error.message);
      }

      if (error.message.includes('Invalid') || error.message.includes('required')) {
        return createErrorResponse(400, 'VALIDATION_ERROR', error.message);
      }

      if (error.message.includes('Unauthorized') || error.message.includes('not own')) {
        return createErrorResponse(403, 'FORBIDDEN', error.message);
      }
    }

    // Handle unexpected errors
    return createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to confirm file upload');
  }
}

/**
 * Parse request body
 *
 * @param body - Request body string
 * @returns Parsed request
 */
function parseRequest(body: string | null): FileConfirmationRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  try {
    return JSON.parse(body) as FileConfirmationRequest;
  } catch {
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Validate file confirmation request
 *
 * @param request - File confirmation request
 * @throws Error if validation fails
 */
function validateRequest(request: FileConfirmationRequest): void {
  // Validate file key
  if (!request.fileKey || request.fileKey.trim().length === 0) {
    throw new Error('File key is required');
  }

  // Validate file type
  const validFileTypes: string[] = ['avatar', 'background', 'post', 'recipe'];
  if (!validFileTypes.includes(request.fileType)) {
    throw new Error(`Invalid file type. Must be one of: ${validFileTypes.join(', ')}`);
  }

  // Validate sub-folder for post/recipe images
  if ((request.fileType === 'post' || request.fileType === 'recipe') && !request.subFolder) {
    throw new Error(
      `Sub-folder (${request.fileType}Id) is required for ${request.fileType} images`
    );
  }
}

/**
 * Verify file exists in S3
 *
 * @param fileKey - S3 file key
 * @returns File metadata from S3
 * @throws Error if file does not exist
 */
async function verifyFileInS3(fileKey: string) {
  try {
    const command = new HeadObjectCommand({
      Bucket: getContentBucket(),
      Key: fileKey,
    });

    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      throw new Error(`File not found in S3: ${fileKey}`);
    }
    throw new Error(`Failed to verify file in S3: ${error}`);
  }
}

/**
 * Verify user owns the file
 *
 * @param fileKey - S3 file key
 * @param userId - User ID
 * @throws Error if user does not own the file
 */
function verifyFileOwnership(fileKey: string, userId: string): void {
  // Extract user ID from file key
  // Format: {folder}/{userId}/{subFolder?}/{fileName}
  const parts = fileKey.split('/');

  if (parts.length < 2) {
    throw new Error('Invalid file key format');
  }

  const fileUserId = parts[1];

  if (fileUserId !== userId) {
    throw new Error('Unauthorized: You do not own this file');
  }
}

/**
 * Update DynamoDB with file metadata
 *
 * @param userId - User ID
 * @param request - File confirmation request
 * @param s3Metadata - S3 file metadata
 */
async function updateFileMetadata(
  userId: string,
  request: FileConfirmationRequest,
  s3Metadata: any
): Promise<void> {
  const timestamp = Date.now();
  const cdnUrl = `https://${getCdnDomain()}/${request.fileKey}`;

  // Determine PK and SK based on file type
  let PK: string;
  let SK: string;

  switch (request.fileType) {
    case 'avatar':
      PK = `USER#${userId}`;
      SK = 'AVATAR';
      break;
    case 'background':
      PK = `USER#${userId}`;
      SK = 'BACKGROUND';
      break;
    case 'post':
      PK = `POST#${request.subFolder}`;
      SK = `IMAGE#${extractFileName(request.fileKey)}`;
      break;
    case 'recipe':
      PK = `USER#${userId}`;
      SK = `RECIPE#${request.subFolder}#IMAGE#${extractFileName(request.fileKey)}`;
      break;
    default:
      throw new Error(`Unsupported file type: ${request.fileType}`);
  }

  const metadata: FileMetadata = {
    fileKey: request.fileKey,
    fileName: extractFileName(request.fileKey),
    contentType: s3Metadata.ContentType || 'application/octet-stream',
    fileSize: s3Metadata.ContentLength || 0,
    uploadedBy: userId,
    uploadedAt: timestamp,
    cdnUrl,
    status: 'uploaded',
  };

  // Store metadata in DynamoDB
  await dynamoClient.send(
    new PutCommand({
      TableName: getDynamoTable(),
      Item: {
        PK,
        SK,
        ...metadata,
        entityType: 'FILE_METADATA',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })
  );
}

/**
 * Queue image processing if file is an image
 *
 * @param userId - User ID
 * @param request - File confirmation request
 * @param s3Metadata - S3 file metadata
 * @returns True if processing was queued
 */
async function queueImageProcessing(
  userId: string,
  request: FileConfirmationRequest,
  s3Metadata: any
): Promise<boolean> {
  const contentType = (s3Metadata.ContentType as string) || '';

  // Check if file is an image
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!imageTypes.includes(contentType)) {
    return false;
  }

  // Skip queueing if queue URL is not configured
  const queueUrl = getImageProcessingQueueUrl();
  if (!queueUrl) {
    console.warn('Image processing queue URL not configured, skipping image processing');
    return false;
  }

  // Determine processing operations based on file type
  const operations = getImageOperations(request.fileType);

  // Create processing message
  const message: ImageProcessingMessage = {
    fileKey: request.fileKey,
    userId,
    fileType: request.fileType,
    contentType,
    operations,
    timestamp: Date.now(),
  };

  // Send message to SQS queue
  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          fileType: {
            DataType: 'String',
            StringValue: request.fileType,
          },
          userId: {
            DataType: 'String',
            StringValue: userId,
          },
        },
      })
    );

    console.log('Image processing queued:', {
      fileKey: request.fileKey,
      fileType: request.fileType,
      operations: operations.map((op) => op.type),
    });

    return true;
  } catch (error) {
    console.error('Failed to queue image processing:', error);
    // Don't fail the confirmation if queueing fails
    return false;
  }
}

/**
 * Get image processing operations based on file type
 *
 * @param fileType - File type
 * @returns Array of image operations
 */
function getImageOperations(fileType: string) {
  switch (fileType) {
    case 'avatar':
      return [
        { type: 'resize' as const, params: { width: 200, height: 200, fit: 'cover' } },
        { type: 'compress' as const, params: { quality: 85 } },
        { type: 'thumbnail' as const, params: { width: 50, height: 50 } },
      ];

    case 'background':
      return [
        { type: 'resize' as const, params: { width: 1920, height: 1080, fit: 'cover' } },
        { type: 'compress' as const, params: { quality: 90 } },
      ];

    case 'post':
    case 'recipe':
      return [
        { type: 'resize' as const, params: { width: 1200, height: 1200, fit: 'inside' } },
        { type: 'compress' as const, params: { quality: 85 } },
        { type: 'thumbnail' as const, params: { width: 300, height: 300 } },
      ];

    default:
      return [{ type: 'compress' as const, params: { quality: 85 } }];
  }
}

/**
 * Extract file name from S3 key
 *
 * @param fileKey - S3 file key
 * @returns File name
 */
function extractFileName(fileKey: string): string {
  const parts = fileKey.split('/');
  return parts[parts.length - 1];
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
