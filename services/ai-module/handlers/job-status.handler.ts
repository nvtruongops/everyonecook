/**
 * Job Status Handler
 *
 * Handles checking the status of AI processing jobs and returning results when completed.
 *
 * User Flow:
 * 1. User searches ingredients → Task 5.5.2 queues AI job → Returns jobId
 * 2. Frontend polls this endpoint → GET /v1/ai/jobs/:jobId
 * 3. Job COMPLETED → Return AI-generated recipes (WITH amounts)
 * 4. User views recipes → Clicks "Save" to add to Manager Recipe (Task 5.5.5)
 *
 * @see .kiro/specs/project-restructure/ai-services-design.md - Job Tracking section
 * @see .kiro/specs/project-restructure/database-architecture.md - TTL Strategies
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { JobStatusRecord, JobStatus, Recipe } from '../models';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Get table name dynamically to support testing
function getTableName(): string {
  return process.env.DYNAMODB_TABLE || 'EveryoneCook';
}

/**
 * Job status response
 */
export interface JobStatusResponse {
  /** Job ID */
  jobId: string;

  /** Job status */
  status: JobStatus;

  /** Response message */
  message: string;

  /** Recipes (only if COMPLETED) */
  recipes?: Recipe[];

  /** Error message (only if FAILED) */
  error?: string;

  /** Job creation timestamp */
  createdAt: number;

  /** Job completion timestamp (if COMPLETED or FAILED) */
  completedAt?: number;

  /** TTL timestamp (7 days from creation) */
  ttl: number;
}

/**
 * Get job status handler
 *
 * Returns the current status of an AI processing job.
 *
 * @param jobId - Job ID to check
 * @param userId - User ID (for authorization)
 * @returns Job status response
 *
 * @example
 * ```typescript
 * // PENDING
 * const response = await getJobStatus('job123', 'user456');
 * // { status: 'PENDING', message: 'Job is queued for processing' }
 *
 * // PROCESSING
 * const response = await getJobStatus('job123', 'user456');
 * // { status: 'PROCESSING', message: 'AI is generating recipes' }
 *
 * // COMPLETED
 * const response = await getJobStatus('job123', 'user456');
 * // { status: 'COMPLETED', message: 'Recipes generated successfully', recipes: [...] }
 *
 * // FAILED
 * const response = await getJobStatus('job123', 'user456');
 * // { status: 'FAILED', message: 'Job failed', error: 'AI service unavailable' }
 * ```
 */
export async function getJobStatus(jobId: string, userId: string): Promise<JobStatusResponse> {
  console.log('[JobStatus] Getting job status', { jobId, userId });

  // Validate input
  if (!jobId || !userId) {
    throw new Error('Job ID and User ID are required');
  }

  // Get job status from DynamoDB using SDK v3
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        PK: `JOB#${jobId}`,
        SK: 'STATUS',
      },
    })
  );

  // Job not found
  if (!result.Item) {
    console.log('[JobStatus] Job not found', { jobId });
    throw new Error('Job not found');
  }

  const jobRecord = result.Item as JobStatusRecord;

  // Authorization check - only job owner can view status
  if (jobRecord.userId !== userId) {
    console.log('[JobStatus] Unauthorized access attempt', {
      jobId,
      requestUserId: userId,
      jobUserId: jobRecord.userId,
    });
    throw new Error('Unauthorized: You can only view your own jobs');
  }

  // Build response based on status
  const response: JobStatusResponse = {
    jobId: jobRecord.jobId,
    status: jobRecord.status,
    message: getStatusMessage(jobRecord.status),
    createdAt: jobRecord.createdAt,
    ttl: jobRecord.ttl,
  };

  // Add completion timestamp if job is done
  if (jobRecord.completedAt) {
    response.completedAt = jobRecord.completedAt;
  }

  // Add recipes if COMPLETED
  if (jobRecord.status === 'COMPLETED' && jobRecord.result) {
    response.recipes = jobRecord.result;
    console.log('[JobStatus] Job completed', {
      jobId,
      recipeCount: jobRecord.result.length,
    });
  }

  // Add error if FAILED
  if (jobRecord.status === 'FAILED' && jobRecord.error) {
    response.error = jobRecord.error;
    console.log('[JobStatus] Job failed', { jobId, error: jobRecord.error });
  }

  return response;
}

/**
 * Get user-friendly status message
 */
function getStatusMessage(status: JobStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Job is queued for processing';
    case 'PROCESSING':
      return 'AI is generating recipes';
    case 'COMPLETED':
      return 'Recipes generated successfully';
    case 'FAILED':
      return 'Job failed';
    default:
      return 'Unknown status';
  }
}

/**
 * Lambda handler
 *
 * API Gateway integration for GET /v1/ai/jobs/:jobId
 *
 * @example
 * ```typescript
 * // API Gateway event
 * {
 *   pathParameters: { jobId: 'job123' },
 *   requestContext: {
 *     authorizer: {
 *       claims: { sub: 'user456' }
 *     }
 *   }
 * }
 * ```
 */
export async function handler(event: any): Promise<any> {
  try {
    // Extract job ID from path parameters or path
    let jobId = event.pathParameters?.jobId;

    // If pathParameters not available, extract from path
    if (!jobId) {
      const path = event.path || event.resource || '';
      // Path format: /ai/suggestions/{jobId} or /v1/ai/suggestions/{jobId}
      const match = path.match(/\/ai\/suggestions\/([^\/]+)$/);
      if (match) {
        jobId = match[1];
      }
    }

    if (!jobId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Job ID is required',
        }),
      };
    }

    // Extract user ID from Cognito authorizer
    const userId = event.requestContext?.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Unauthorized: User ID not found',
        }),
      };
    }

    // Get job status
    const response = await getJobStatus(jobId, userId);

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[JobStatus] Error:', error);

    // Handle specific errors
    if (error.message === 'Job not found') {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Job not found',
        }),
      };
    }

    if (error.message.startsWith('Unauthorized')) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: error.message,
        }),
      };
    }

    // Generic error
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
}
