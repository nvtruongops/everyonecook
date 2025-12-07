/**
 * Response Formatting Utilities
 *
 * Provides consistent response formatting for API Gateway responses.
 * Handles success and error responses with proper HTTP status codes.
 *
 * @module utils/response
 */

import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    correlationId: string;
  };
}

/**
 * Creates a success response
 *
 * @param data - Response data
 * @param statusCode - HTTP status code (default: 200)
 * @param correlationId - Correlation ID for tracing
 * @returns API Gateway proxy result
 */
export const successResponse = (
  data: any,
  statusCode: number = 200,
  correlationId?: string
): APIGatewayProxyResult => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (correlationId) {
    headers['X-Correlation-ID'] = correlationId;
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(data),
  };
};

/**
 * Creates an error response
 *
 * @param code - Error code
 * @param message - User-friendly error message
 * @param statusCode - HTTP status code
 * @param correlationId - Correlation ID for tracing
 * @param details - Additional error details
 * @returns API Gateway proxy result
 */
export const errorResponse = (
  code: string,
  message: string,
  statusCode: number,
  correlationId: string,
  details?: any
): APIGatewayProxyResult => {
  const errorBody: ErrorResponse = {
    error: {
      code,
      message,
      correlationId,
      ...(details && { details }),
    },
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify(errorBody),
  };
};

/**
 * Common error response helpers
 */
export const badRequestResponse = (
  message: string,
  correlationId: string,
  details?: any
): APIGatewayProxyResult => {
  return errorResponse('BAD_REQUEST', message, 400, correlationId, details);
};

export const unauthorizedResponse = (
  message: string,
  correlationId: string
): APIGatewayProxyResult => {
  return errorResponse('UNAUTHORIZED', message, 401, correlationId);
};

export const forbiddenResponse = (
  message: string,
  correlationId: string
): APIGatewayProxyResult => {
  return errorResponse('FORBIDDEN', message, 403, correlationId);
};

export const notFoundResponse = (message: string, correlationId: string): APIGatewayProxyResult => {
  return errorResponse('NOT_FOUND', message, 404, correlationId);
};

export const internalServerErrorResponse = (
  message: string,
  correlationId: string,
  details?: any
): APIGatewayProxyResult => {
  return errorResponse('INTERNAL_SERVER_ERROR', message, 500, correlationId, details);
};
