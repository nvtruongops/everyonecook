/**
 * Sync Users Handler
 *
 * Admin endpoint to sync users between Cognito and DynamoDB.
 * Removes orphaned users from DynamoDB that no longer exist in Cognito.
 *
 * POST /admin/users/sync
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { AuditLogService } from '../services/audit-log.service';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});
const s3Client = new S3Client({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CONTENT_BUCKET = process.env.CONTENT_BUCKET || '';

const auditLogService = new AuditLogService();

interface CognitoUserInfo {
  sub: string;
  username: string;
  email?: string;
}

interface SyncResult {
  totalDynamoUsers: number;
  totalCognitoUsers: number;
  // Users in DynamoDB but not in Cognito (orphaned in DynamoDB)
  orphanedDynamoUsers: string[];
  deletedDynamoUsers: string[];
  deletedDynamoRecords: number;
  // Users in Cognito but not in DynamoDB (orphaned in Cognito)
  orphanedCognitoUsers: CognitoUserInfo[];
  deletedCognitoUsers: string[];
  deletedS3Objects: number;
  errors: string[];
}

/**
 * Get all Cognito users with their info (sub, username, email)
 */
async function getAllCognitoUsers(): Promise<Map<string, CognitoUserInfo>> {
  const users = new Map<string, CognitoUserInfo>();
  let paginationToken: string | undefined;

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
        PaginationToken: paginationToken,
        AttributesToGet: ['sub', 'email'],
      })
    );

    for (const user of response.Users || []) {
      const sub = user.Attributes?.find((a) => a.Name === 'sub')?.Value;
      const email = user.Attributes?.find((a) => a.Name === 'email')?.Value;
      const username = user.Username || '';
      
      if (sub) {
        users.set(sub, { sub, username, email });
      }
    }

    paginationToken = response.PaginationToken;
  } while (paginationToken);

  return users;
}

/**
 * Delete a user from Cognito
 * Note: AdminDeleteUserCommand requires the actual username, not the sub
 */
async function deleteCognitoUser(username: string): Promise<void> {
  console.log('[SyncUsers] Deleting Cognito user:', { username, userPoolId: USER_POOL_ID });
  
  await cognitoClient.send(
    new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    })
  );
  
  console.log('[SyncUsers] Cognito user deleted successfully:', { username });
}

/**
 * Get all DynamoDB user IDs
 */
async function getAllDynamoUserIds(): Promise<Map<string, any>> {
  const users = new Map<string, any>();
  let lastEvaluatedKey: any;

  do {
    const response = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'PROFILE' },
        ProjectionExpression: 'PK, userId, username, email',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const item of response.Items || []) {
      const userId = item.userId || item.PK?.replace('USER#', '');
      if (userId) {
        users.set(userId, item);
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return users;
}

/**
 * Delete all DynamoDB records for a user
 */
async function deleteUserDynamoRecords(userId: string): Promise<number> {
  let deletedCount = 0;
  const pk = `USER#${userId}`;

  // Query all records with this PK
  let lastEvaluatedKey: any;
  const keysToDelete: { PK: string; SK: string }[] = [];

  do {
    const response = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const item of response.Items || []) {
      keysToDelete.push({ PK: item.PK, SK: item.SK });
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Batch delete (max 25 items per batch)
  for (let i = 0; i < keysToDelete.length; i += 25) {
    const batch = keysToDelete.slice(i, i + 25);
    await dynamoDB.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((key) => ({
            DeleteRequest: { Key: key },
          })),
        },
      })
    );
    deletedCount += batch.length;
  }

  return deletedCount;
}

/**
 * Delete S3 objects for a user
 */
async function deleteUserS3Objects(userId: string): Promise<number> {
  if (!CONTENT_BUCKET) return 0;

  let deletedCount = 0;
  const prefixes = [`avatars/${userId}/`, `posts/${userId}/`, `recipes/${userId}/`];

  for (const prefix of prefixes) {
    let continuationToken: string | undefined;

    do {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: CONTENT_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const objects = listResponse.Contents || [];
      if (objects.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: CONTENT_BUCKET,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key! })),
            },
          })
        );
        deletedCount += objects.length;
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }

  return deletedCount;
}

/**
 * Sync Users Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `sync-${Date.now()}`;

  console.log('[SyncUsers] Starting handler', { correlationId });

  try {
    // Authorization check
    requireAdminRole(event);

    // Get admin user ID (may be null if using API key)
    let adminUserId = 'system';
    try {
      adminUserId = getAdminUserId(event);
    } catch {
      // Using API key, no JWT available
      adminUserId = 'api-key-admin';
    }

    // Parse request body for options
    const body = event.body ? JSON.parse(event.body) : {};
    const dryRun = body.dryRun !== false; // Default to dry run for safety
    const deleteS3 = body.deleteS3 === true; // Default to not delete S3
    const deleteCognitoOrphans = body.deleteCognitoOrphans === true; // Delete users in Cognito but not in DynamoDB

    console.log('[SyncUsers] Options:', { dryRun, deleteS3, deleteCognitoOrphans });

    const result: SyncResult = {
      totalDynamoUsers: 0,
      totalCognitoUsers: 0,
      orphanedDynamoUsers: [],
      deletedDynamoUsers: [],
      deletedDynamoRecords: 0,
      orphanedCognitoUsers: [],
      deletedCognitoUsers: [],
      deletedS3Objects: 0,
      errors: [],
    };

    // Get all users from both sources
    console.log('[SyncUsers] Fetching Cognito users...');
    const cognitoUsers = await getAllCognitoUsers();
    result.totalCognitoUsers = cognitoUsers.size;
    console.log('[SyncUsers] Cognito users:', result.totalCognitoUsers);

    console.log('[SyncUsers] Fetching DynamoDB users...');
    const dynamoUsers = await getAllDynamoUserIds();
    result.totalDynamoUsers = dynamoUsers.size;
    console.log('[SyncUsers] DynamoDB users:', result.totalDynamoUsers);

    // Create a set of DynamoDB user IDs for quick lookup
    const dynamoUserIds = new Set(dynamoUsers.keys());

    // Find orphaned DynamoDB users (in DynamoDB but not in Cognito)
    for (const [userId, userData] of dynamoUsers) {
      if (!cognitoUsers.has(userId)) {
        result.orphanedDynamoUsers.push(userId);
        console.log('[SyncUsers] Found orphaned DynamoDB user:', {
          userId,
          username: userData.username,
          email: userData.email,
        });
      }
    }

    // Find orphaned Cognito users (in Cognito but not in DynamoDB)
    for (const [sub, userInfo] of cognitoUsers) {
      if (!dynamoUserIds.has(sub)) {
        result.orphanedCognitoUsers.push(userInfo);
        console.log('[SyncUsers] Found orphaned Cognito user:', {
          sub,
          username: userInfo.username,
          email: userInfo.email,
        });
      }
    }

    console.log('[SyncUsers] Orphaned DynamoDB users found:', result.orphanedDynamoUsers.length);
    console.log('[SyncUsers] Orphaned Cognito users found:', result.orphanedCognitoUsers.length);

    // Delete orphaned DynamoDB users if not dry run
    if (!dryRun && result.orphanedDynamoUsers.length > 0) {
      for (const userId of result.orphanedDynamoUsers) {
        try {
          // Delete DynamoDB records
          const deletedRecords = await deleteUserDynamoRecords(userId);
          result.deletedDynamoRecords += deletedRecords;

          // Delete S3 objects if requested
          if (deleteS3) {
            const deletedS3 = await deleteUserS3Objects(userId);
            result.deletedS3Objects += deletedS3;
          }

          result.deletedDynamoUsers.push(userId);
          console.log('[SyncUsers] Deleted DynamoDB user:', { userId, deletedRecords });
        } catch (error) {
          const errorMsg = `Failed to delete DynamoDB user ${userId}: ${(error as Error).message}`;
          result.errors.push(errorMsg);
          console.error('[SyncUsers]', errorMsg);
        }
      }
    }

    // Delete orphaned Cognito users if not dry run and deleteCognitoOrphans is true
    if (!dryRun && deleteCognitoOrphans && result.orphanedCognitoUsers.length > 0) {
      for (const userInfo of result.orphanedCognitoUsers) {
        try {
          // Delete from Cognito using username (not sub)
          await deleteCognitoUser(userInfo.username);
          result.deletedCognitoUsers.push(userInfo.username);
          console.log('[SyncUsers] Deleted Cognito user:', { username: userInfo.username });
        } catch (error: any) {
          if (error.name === 'UserNotFoundException') {
            console.log('[SyncUsers] Cognito user already deleted:', { username: userInfo.username });
            result.deletedCognitoUsers.push(userInfo.username);
          } else {
            const errorMsg = `Failed to delete Cognito user ${userInfo.username}: ${error.message}`;
            result.errors.push(errorMsg);
            console.error('[SyncUsers]', errorMsg);
          }
        }
      }
    }

    // Log audit if any changes were made
    if (!dryRun && (result.deletedDynamoUsers.length > 0 || result.deletedCognitoUsers.length > 0)) {
      await auditLogService.logAction({
        adminUserId,
        adminUsername: 'admin',
        action: 'CLEANUP_USERS' as any,
        targetUserId: null,
        targetUsername: null,
        reason: `Synced users: ${result.deletedDynamoUsers.length} DynamoDB orphans, ${result.deletedCognitoUsers.length} Cognito orphans deleted`,
        ipAddress: event.requestContext?.identity?.sourceIp || 'unknown',
        metadata: {
          orphanedDynamoUsers: result.orphanedDynamoUsers.length,
          deletedDynamoUsers: result.deletedDynamoUsers.length,
          deletedDynamoRecords: result.deletedDynamoRecords,
          orphanedCognitoUsers: result.orphanedCognitoUsers.length,
          deletedCognitoUsers: result.deletedCognitoUsers.length,
          deletedS3Objects: result.deletedS3Objects,
        },
      });
    }

    return createSuccessResponse(
      200,
      {
        message: dryRun
          ? 'Dry run completed - no changes made'
          : `Sync completed - ${result.deletedDynamoUsers.length} DynamoDB orphans, ${result.deletedCognitoUsers.length} Cognito orphans deleted`,
        dryRun,
        deleteCognitoOrphans,
        ...result,
      },
      correlationId
    );
  } catch (error) {
    console.error('[SyncUsers] Handler error:', error);
    return handleError(error, correlationId);
  }
}
