/**
 * Upload Module - Main Lambda Handler
 *
 * Routes incoming requests to appropriate sub-handlers based on path and method.
 * This is the entry point for the Upload Lambda function.
 *
 * @module upload-module/handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Helper function to create error response
 */
function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Main Lambda handler
 * Routes requests based on HTTP method and path
 *
 * @param event - API Gateway proxy event
 * @returns API Gateway proxy result
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Upload Module - Incoming request:', {
    method: event.httpMethod,
    path: event.path,
    resource: event.resource,
    pathParameters: event.pathParameters,
  });

  const method = event.httpMethod;
  const path = event.path;

  try {
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: '',
      };
    }

    // Presigned URL generation endpoint
    if (method === 'POST' && path === '/upload/presigned-url') {
      const { handler: presignedUrlHandler } = await import('./handlers/presigned-url.handler');
      return await presignedUrlHandler(event);
    }

    // Upload confirmation endpoint
    if (method === 'POST' && path === '/upload/confirm') {
      const { handler: confirmationHandler } = await import('./handlers/confirmation.handler');
      return await confirmationHandler(event);
    }

    // File deletion endpoint
    if (method === 'DELETE' && path.match(/^\/upload\/.+$/)) {
      const { handler: deletionHandler } = await import('./handlers/deletion.handler');
      return await deletionHandler(event);
    }

    // No matching route
    return errorResponse(404, `Route not found: ${method} ${path}`);
  } catch (error: any) {
    console.error('Upload Module - Error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
}
