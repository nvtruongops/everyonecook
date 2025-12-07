/**
 * Lambda Invocation Utility
 *
 * Invokes target Lambda functions based on routing decisions.
 * Handles request forwarding and response parsing.
 *
 * @module utils/lambda-invoker
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractPathParams } from './router';
import { API_ROUTES } from '../routes/api-routes';
import { matchPath } from './router';

// Initialize Lambda client
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

// Initialize DynamoDB client for activity tracking
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

// Track last activity update to avoid too frequent updates (throttle to 5 minutes)
const activityCache = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Track hourly activity to avoid duplicate writes per hour
const hourlyActivityCache = new Map<string, boolean>();
const VN_OFFSET = 7 * 60 * 60 * 1000; // Vietnam timezone UTC+7

/**
 * Lambda ARN mapping from handler names to actual ARNs
 * These are injected via environment variables by CDK
 */
const LAMBDA_ARN_MAP: Record<string, string> = {
  'auth-user-lambda': process.env.AUTH_USER_LAMBDA_ARN || '',
  'social-lambda': process.env.SOCIAL_LAMBDA_ARN || '',
  'recipe-ai-lambda': process.env.RECIPE_AI_LAMBDA_ARN || '',
  'admin-lambda': process.env.ADMIN_LAMBDA_ARN || '',
  'upload-lambda': process.env.UPLOAD_LAMBDA_ARN || '',
  'health-check': 'INLINE', // Special handler for health checks
};

/**
 * Get current date and hour in Vietnam timezone
 */
function getVNDateHour(timestamp: number): { date: string; hour: number } {
  const vnTime = new Date(timestamp + VN_OFFSET);
  const date = vnTime.toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = vnTime.getUTCHours();
  return { date, hour };
}

/**
 * Update user's last activity timestamp and hourly activity log
 * - lastActivityAt: updated every 5 minutes (for backward compatibility)
 * - ACTIVITY_LOG: created once per hour per user (for accurate hourly stats)
 */
async function updateUserActivity(userId: string): Promise<void> {
  const now = Date.now();
  const lastUpdate = activityCache.get(userId) || 0;
  const { date, hour } = getVNDateHour(now);
  const hourlyKey = `${userId}#${date}#${hour}`;

  // Update lastActivityAt every 5 minutes (throttled)
  const shouldUpdateLastActivity = now - lastUpdate >= ACTIVITY_UPDATE_INTERVAL;

  // Create hourly activity log once per hour per user
  const shouldCreateHourlyLog = !hourlyActivityCache.has(hourlyKey);

  if (!shouldUpdateLastActivity && !shouldCreateHourlyLog) {
    return;
  }

  // Update caches immediately to prevent concurrent updates
  if (shouldUpdateLastActivity) {
    activityCache.set(userId, now);
  }
  if (shouldCreateHourlyLog) {
    hourlyActivityCache.set(hourlyKey, true);

    // Clean old cache entries (keep only last 24 hours)
    const oldDate = new Date(now - 24 * 60 * 60 * 1000 + VN_OFFSET).toISOString().split('T')[0];
    for (const key of hourlyActivityCache.keys()) {
      if (key.includes(oldDate) || key < `${userId}#${oldDate}`) {
        hourlyActivityCache.delete(key);
      }
    }
  }

  try {
    const promises: Promise<any>[] = [];

    // Update lastActivityAt in user profile (only if profile exists)
    if (shouldUpdateLastActivity) {
      promises.push(
        dynamoDB
          .send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
              UpdateExpression: 'SET lastActivityAt = :now',
              ExpressionAttributeValues: { ':now': now },
              // Only update if profile already exists (has username attribute)
              ConditionExpression: 'attribute_exists(username)',
            })
          )
          .catch(() => {
            // Ignore error if profile doesn't exist (user deleted)
          })
      );
    }

    // Create hourly activity log record
    // PK: ACTIVITY_LOG#<date>, SK: <hour>#<userId>
    // This allows efficient querying by date and grouping by hour
    if (shouldCreateHourlyLog) {
      promises.push(
        dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `ACTIVITY_LOG#${date}`,
              SK: `${hour.toString().padStart(2, '0')}#${userId}`,
            },
            UpdateExpression:
              'SET userId = :userId, #h = :hour, #d = :date, firstActivityAt = if_not_exists(firstActivityAt, :now), lastActivityAt = :now, activityCount = if_not_exists(activityCount, :zero) + :one',
            ExpressionAttributeNames: {
              '#h': 'hour',
              '#d': 'date',
            },
            ExpressionAttributeValues: {
              ':userId': userId,
              ':hour': hour,
              ':date': date,
              ':now': now,
              ':zero': 0,
              ':one': 1,
            },
          })
        )
      );
    }

    await Promise.all(promises);
  } catch (error) {
    // Don't fail the request if activity update fails
    console.warn('Failed to update user activity', { userId, error });
  }
}

/**
 * Invokes a target Lambda function with the API Gateway event
 *
 * @param handlerName - Handler name from routing (e.g., 'auth-user-lambda')
 * @param event - Original API Gateway proxy event
 * @param decodedToken - Decoded JWT token (if authenticated)
 * @returns API Gateway proxy result from target Lambda
 * @throws Error if Lambda invocation fails
 */
export async function invokeLambda(
  handlerName: string,
  event: APIGatewayProxyEvent,
  decodedToken: any | null
): Promise<APIGatewayProxyResult> {
  // Track user activity (fire and forget - don't await)
  if (decodedToken?.sub) {
    updateUserActivity(decodedToken.sub).catch(() => {});
  }
  // Handle inline health check without Lambda invocation
  if (handlerName === 'health-check') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'healthy',
        service: 'everyonecook-api',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      }),
    };
  }

  // Get Lambda ARN from mapping
  const lambdaArn = LAMBDA_ARN_MAP[handlerName];

  if (!lambdaArn) {
    throw new Error(`No Lambda ARN configured for handler: ${handlerName}`);
  }

  // Normalize path by removing /api prefix for route matching
  let normalizedPath = event.path;
  if (normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.substring(4); // Remove '/api' prefix
  } else if (normalizedPath.startsWith('/api')) {
    normalizedPath = normalizedPath.substring(4) || '/';
  }

  // Extract path parameters from route pattern
  const routePattern = findRoutePattern(event.httpMethod, normalizedPath);
  const pathParameters = routePattern
    ? extractPathParams(routePattern, normalizedPath)
    : event.pathParameters || {};

  // Prepare payload - forward original event with decoded token and path parameters
  const payload = {
    ...event,
    pathParameters: {
      ...event.pathParameters,
      ...pathParameters,
    },
    requestContext: {
      ...event.requestContext,
      authorizer: decodedToken
        ? {
            claims: decodedToken,
            userId: decodedToken.sub,
            // Support both 'username' (Access Token) and 'cognito:username' (ID Token)
            username: decodedToken.username || decodedToken['cognito:username'],
          }
        : undefined,
    },
  };

  try {
    // Invoke target Lambda
    const command = new InvokeCommand({
      FunctionName: lambdaArn,
      InvocationType: 'RequestResponse', // Synchronous invocation
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);

    // Parse response payload
    if (!response.Payload) {
      throw new Error('No payload returned from Lambda');
    }

    const payloadString = new TextDecoder().decode(response.Payload);
    const result: APIGatewayProxyResult = JSON.parse(payloadString);

    // Check for Lambda execution errors
    if (response.FunctionError) {
      console.error('Lambda execution error:', {
        handlerName,
        error: response.FunctionError,
        payload: payloadString,
      });

      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'LAMBDA_EXECUTION_ERROR',
            message: 'Internal server error',
          },
        }),
      };
    }

    return result;
  } catch (error) {
    console.error('Failed to invoke Lambda:', {
      handlerName,
      lambdaArn,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new Error(`Failed to invoke Lambda: ${handlerName}`);
  }
}

/**
 * Validates that all required Lambda ARNs are configured
 *
 * @throws Error if any required Lambda ARN is missing
 */
export function validateLambdaConfiguration(): void {
  const missingArns: string[] = [];

  for (const [handlerName, arn] of Object.entries(LAMBDA_ARN_MAP)) {
    if (!arn) {
      missingArns.push(handlerName);
    }
  }

  if (missingArns.length > 0) {
    throw new Error(`Missing Lambda ARN configuration for: ${missingArns.join(', ')}`);
  }
}

/**
 * Find route pattern that matches the given method and path
 *
 * @param method - HTTP method
 * @param path - Request path
 * @returns Route pattern or null if not found
 */
function findRoutePattern(method: string, path: string): string | null {
  const normalizedMethod = method.toUpperCase();

  for (const route of API_ROUTES) {
    if (route.method === normalizedMethod && matchPath(route.path, path)) {
      return route.path;
    }
  }

  return null;
}
