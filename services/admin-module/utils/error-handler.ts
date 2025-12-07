/**
 * Error Handler Utility
 *
 * Centralized error handling for admin operations.
 * Provides consistent error responses and logging.
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ValidationError } from '../models/validation';
import { UnauthorizedError } from '../middleware/admin-auth';
import { RateLimitError } from '../middleware/rate-limit';
import { BanServiceError } from '../services/ban.service';
import { ModerationServiceError } from '../services/moderation.service';

/**
 * Admin Error Codes
 *
 * Standardized error codes for admin operations.
 */
export enum AdminErrorCode {
  // Authorization errors
  ADMIN_UNAUTHORIZED = 'ADMIN_001',
  INVALID_JWT = 'ADMIN_002',

  // Validation errors
  VALIDATION_ERROR = 'ADMIN_100',
  INVALID_USER_ID = 'ADMIN_101',
  INVALID_BAN_DURATION = 'ADMIN_102',

  // User errors
  TARGET_USER_NOT_FOUND = 'ADMIN_200',
  ALREADY_BANNED = 'ADMIN_201',
  NOT_BANNED = 'ADMIN_202',

  // Operation errors
  BAN_OPERATION_FAILED = 'ADMIN_300',
  UNBAN_OPERATION_FAILED = 'ADMIN_301',
  CLEANUP_OPERATION_FAILED = 'ADMIN_302',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'ADMIN_400',

  // Internal errors
  INTERNAL_ERROR = 'ADMIN_500',
}

/**
 * Error Response
 *
 * Standard error response structure.
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    correlationId?: string;
    retryAfter?: number;
  };
}

/**
 * Handle Error
 *
 * Converts errors to API Gateway responses.
 *
 * @param error - Error to handle
 * @param correlationId - Request correlation ID
 * @returns API Gateway response
 */
export function handleError(error: unknown, correlationId?: string): APIGatewayProxyResult {
  console.error('Error occurred', {
    error,
    correlationId,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Validation errors
  if (error instanceof ValidationError) {
    return createErrorResponse(
      400,
      AdminErrorCode.VALIDATION_ERROR,
      'Validation failed',
      { errors: error.errors },
      correlationId
    );
  }

  // Authorization errors
  if (error instanceof UnauthorizedError) {
    return createErrorResponse(
      403,
      'ADMIN_UNAUTHORIZED' as AdminErrorCode,
      error.message,
      undefined,
      correlationId
    );
  }

  // Rate limit errors
  if (error instanceof RateLimitError) {
    return createErrorResponse(
      429,
      'RATE_LIMIT_EXCEEDED' as AdminErrorCode,
      error.message,
      { retryAfter: error.retryAfter },
      correlationId,
      error.retryAfter
    );
  }

  // Ban service errors
  if (error instanceof BanServiceError) {
    return createErrorResponse(
      error.statusCode,
      error.code as AdminErrorCode,
      error.message,
      undefined,
      correlationId
    );
  }

  // Moderation service errors
  if (error instanceof ModerationServiceError) {
    return createErrorResponse(
      error.statusCode,
      error.code as AdminErrorCode,
      error.message,
      undefined,
      correlationId
    );
  }

  // Generic errors
  if (error instanceof Error) {
    return createErrorResponse(
      500,
      AdminErrorCode.INTERNAL_ERROR,
      'Internal server error',
      { message: error.message },
      correlationId
    );
  }

  // Unknown errors
  return createErrorResponse(
    500,
    AdminErrorCode.INTERNAL_ERROR,
    'Unknown error occurred',
    undefined,
    correlationId
  );
}

/**
 * Create Error Response
 *
 * Creates a standardized error response.
 *
 * @param statusCode - HTTP status code
 * @param code - Error code
 * @param message - Error message
 * @param details - Additional details
 * @param correlationId - Request correlation ID
 * @param retryAfter - Retry-After header value (seconds)
 * @returns API Gateway response
 */
function createErrorResponse(
  statusCode: number,
  code: AdminErrorCode,
  message: string,
  details?: any,
  correlationId?: string,
  retryAfter?: number
): APIGatewayProxyResult {
  const response: ErrorResponse = {
    error: {
      code,
      message,
      details,
      correlationId,
      retryAfter,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString();
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(response),
  };
}

/**
 * Create Success Response
 *
 * Creates a standardized success response.
 *
 * @param statusCode - HTTP status code
 * @param data - Response data
 * @param correlationId - Request correlation ID
 * @returns API Gateway response
 */
export function createSuccessResponse(
  statusCode: number,
  data: any,
  correlationId?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      data,
      correlationId,
    }),
  };
}
