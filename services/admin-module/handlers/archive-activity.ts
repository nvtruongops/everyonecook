/**
 * Archive Activity Handler
 *
 * Archives admin activity logs to S3 and deletes from DynamoDB.
 * POST /admin/activity/archive
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createAdminAction } from '../models/admin-action';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const ARCHIVE_BUCKET = 'everyonecook-cdn-logs-dev';
const ARCHIVE_PREFIX = 'archives/activity';

interface ArchiveResult {
  archivedCount: number;
  deletedCount: number;
  s3Key: string;
  errors: string[];
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Verify admin access
    const adminUserId = event.requestContext.authorizer?.claims?.sub;
    const adminUsername = event.requestContext.authorizer?.claims?.['cognito:username'] || 'admin';
    if (!adminUserId) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const result = await archiveActivityLogs(adminUserId);

    // Log admin action AFTER archiving (so this new log won't be archived)
    // Note: This log will appear in the next archive cycle
    if (result.archivedCount > 0) {
      const ipAddress = event.requestContext.identity?.sourceIp || 'unknown';
      const adminAction = createAdminAction({
        adminUserId,
        adminUsername,
        action: 'ARCHIVE_ACTIVITY',
        targetUserId: null,
        reason: `Archived ${result.archivedCount} activity logs to S3`,
        ipAddress,
        metadata: {
          archivedCount: result.archivedCount,
          deletedCount: result.deletedCount,
          s3Key: result.s3Key,
        },
      });

      await dynamoDB.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: adminAction,
        })
      );
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: `Đã archive ${result.archivedCount} activity logs`,
        ...result,
      }),
    };
  } catch (error) {
    console.error('Archive activity error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
}

async function archiveActivityLogs(adminUserId: string): Promise<ArchiveResult> {
  const errors: string[] = [];
  const activityToArchive: any[] = [];

  // 1. Scan for all admin actions
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const scanResult = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(PK, :actionPrefix) AND entityType = :entityType',
        ExpressionAttributeValues: {
          ':actionPrefix': 'ADMIN_ACTION#',
          ':entityType': 'ADMIN_ACTION',
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (scanResult.Items) {
      activityToArchive.push(...scanResult.Items);
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (activityToArchive.length === 0) {
    return {
      archivedCount: 0,
      deletedCount: 0,
      s3Key: '',
      errors: [],
    };
  }

  // 2. Archive to S3
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timestamp = now.getTime();
  const s3Key = `${ARCHIVE_PREFIX}/${dateStr}/activity-${timestamp}.json`;

  const archiveData = {
    archivedAt: now.toISOString(),
    archivedBy: adminUserId,
    totalRecords: activityToArchive.length,
    activities: activityToArchive,
  };

  await s3Client.send(
    new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: s3Key,
      Body: JSON.stringify(archiveData, null, 2),
      ContentType: 'application/json',
    })
  );

  // 3. Delete from DynamoDB in batches of 25
  let deletedCount = 0;

  for (let i = 0; i < activityToArchive.length; i += 25) {
    const batch = activityToArchive.slice(i, i + 25);
    const deleteRequests = batch.map((activity) => ({
      DeleteRequest: {
        Key: {
          PK: activity.PK,
          SK: activity.SK,
        },
      },
    }));

    try {
      await dynamoDB.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: deleteRequests,
          },
        })
      );
      deletedCount += batch.length;
    } catch (err) {
      errors.push(`Failed to delete batch starting at index ${i}`);
    }
  }

  console.log(`[ArchiveActivity] Archived ${activityToArchive.length} activities to ${s3Key}`);

  return {
    archivedCount: activityToArchive.length,
    deletedCount,
    s3Key,
    errors,
  };
}
