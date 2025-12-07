/**
 * File Deletion Handler
 *
 * Handles file deletion from S3 and DynamoDB with support for soft delete.
 * Soft delete allows recovery within 30 days before permanent deletion.
 *
 * @module upload-module/handlers/deletion
 * @see .kiro/specs/project-restructure/storage-architecture.md - File Lifecycle
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  FileDeletionRequest,
  FileDeletionResponse,
  SoftDeleteMetadata,
  ErrorResponse,
} from '../models/deletion.model';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' })
);

// Helper functions to get environment variables (allows for testing)
const getContentBucket = () => process.env.CONTENT_BUCKET || '';
const getDynamoTable = () => process.env.DYNAMODB_TABLE || 'EveryoneCook';

// Soft delete recovery period (30 days)
const RECOVERY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Lambda handler for deleting files
 *
 * @param event - API Gateway event
 * @returns API Gateway response with deletion result
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

    // Verify user owns the file
    verifyFileOwnership(request.fileKey, userId);

    // Get file metadata from DynamoDB
    const metadata = await getFileMetadata(userId, request);

    if (!metadata) {
      return createErrorResponse(404, 'FILE_NOT_FOUND', 'File metadata not found');
    }

    // Perform deletion (soft or hard)
    if (request.softDelete) {
      await performSoftDelete(userId, request, metadata);
    } else {
      await performHardDelete(userId, request);
    }

    const timestamp = Date.now();

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
        deletedAt: timestamp,
        softDeleted: request.softDelete || false,
      } as FileDeletionResponse),
    };
  } catch (error) {
    console.error('Error deleting file:', error);

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
    return createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to delete file');
  }
}

/**
 * Parse request body
 */
function parseRequest(body: string | null): FileDeletionRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  try {
    return JSON.parse(body) as FileDeletionRequest;
  } catch {
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Validate file deletion request
 */
function validateRequest(request: FileDeletionRequest): void {
  if (!request.fileKey || request.fileKey.trim().length === 0) {
    throw new Error('File key is required');
  }

  const validFileTypes: string[] = ['avatar', 'background', 'post', 'recipe'];
  if (!validFileTypes.includes(request.fileType)) {
    throw new Error(`Invalid file type. Must be one of: ${validFileTypes.join(', ')}`);
  }

  if ((request.fileType === 'post' || request.fileType === 'recipe') && !request.subFolder) {
    throw new Error(
      `Sub-folder (${request.fileType}Id) is required for ${request.fileType} images`
    );
  }
}

/**
 * Verify user owns the file
 */
function verifyFileOwnership(fileKey: string, userId: string): void {
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
 * Get file metadata from DynamoDB
 */
async function getFileMetadata(
  userId: string,
  request: FileDeletionRequest
): Promise<Record<string, unknown> | null> {
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

  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: getDynamoTable(),
        Key: { PK, SK },
      })
    );

    return result.Item || null;
  } catch (error) {
    console.error('Error getting file metadata:', error);
    return null;
  }
}

/**
 * Perform soft delete
 */
async function performSoftDelete(
  userId: string,
  request: FileDeletionRequest,
  metadata: Record<string, unknown>
): Promise<void> {
  const timestamp = Date.now();
  const recoveryExpiresAt = timestamp + RECOVERY_PERIOD_MS;

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

  const softDeleteMetadata: SoftDeleteMetadata = {
    deletedAt: timestamp,
    deletedBy: userId,
    originalStatus: (metadata.status as string) || 'uploaded',
    canRecover: true,
    recoveryExpiresAt,
  };

  await dynamoClient.send(
    new UpdateCommand({
      TableName: getDynamoTable(),
      Key: { PK, SK },
      UpdateExpression:
        'SET #status = :deleted, softDeleteMetadata = :metadata, updatedAt = :timestamp, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':deleted': 'deleted',
        ':metadata': softDeleteMetadata,
        ':timestamp': timestamp,
        ':ttl': Math.floor(recoveryExpiresAt / 1000),
      },
    })
  );

  console.log('Soft delete completed:', {
    fileKey: request.fileKey,
    userId,
    recoveryExpiresAt: new Date(recoveryExpiresAt).toISOString(),
  });
}

/**
 * Perform hard delete
 */
async function performHardDelete(userId: string, request: FileDeletionRequest): Promise<void> {
  await deleteFromS3(request.fileKey);
  await deleteFromDynamoDB(userId, request);

  console.log('Hard delete completed:', {
    fileKey: request.fileKey,
    userId,
  });
}

/**
 * Delete file from S3
 */
async function deleteFromS3(fileKey: string): Promise<void> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: getContentBucket(),
        Key: fileKey,
      })
    );

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: getContentBucket(),
        Key: fileKey,
      })
    );

    console.log('File deleted from S3:', fileKey);
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      console.warn('File not found in S3, skipping deletion:', fileKey);
      return;
    }
    throw new Error(`Failed to delete file from S3: ${error}`);
  }
}

/**
 * Delete file metadata from DynamoDB
 */
async function deleteFromDynamoDB(userId: string, request: FileDeletionRequest): Promise<void> {
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

  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: getDynamoTable(),
        Key: { PK, SK },
      })
    );

    console.log('File metadata deleted from DynamoDB:', { PK, SK });
  } catch (error) {
    console.error('Error deleting from DynamoDB:', error);
    throw new Error(`Failed to delete file metadata from DynamoDB: ${error}`);
  }
}

/**
 * Extract file name from S3 key
 */
function extractFileName(fileKey: string): string {
  const parts = fileKey.split('/');
  return parts[parts.length - 1];
}

/**
 * Create error response
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
