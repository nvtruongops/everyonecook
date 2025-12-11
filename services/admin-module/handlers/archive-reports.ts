/**
 * Archive Reports Handler
 *
 * Archives processed reports to S3 and deletes from DynamoDB.
 * POST /admin/reports/archive
 *
 * Only archives reports with status: 'resolved' or 'dismissed'
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
const ARCHIVE_PREFIX = 'archives/reports';

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

    const result = await archiveProcessedReports(adminUserId);

    // Log admin action if any reports were archived
    if (result.archivedCount > 0) {
      const ipAddress = event.requestContext.identity?.sourceIp || 'unknown';
      const adminAction = createAdminAction({
        adminUserId,
        adminUsername,
        action: 'ARCHIVE_REPORTS',
        targetUserId: null,
        reason: `Archived ${result.archivedCount} processed reports to S3`,
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
        message: `Đã archive ${result.archivedCount} reports`,
        ...result,
      }),
    };
  } catch (error) {
    console.error('Archive reports error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
}

async function archiveProcessedReports(adminUserId: string): Promise<ArchiveResult> {
  const errors: string[] = [];
  const reportsToArchive: any[] = [];

  // 1. Scan for processed reports (status = resolved or dismissed)
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const scanResult = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          'begins_with(SK, :reportPrefix) AND (#status = :action_taken OR #status = :dismissed)',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':reportPrefix': 'REPORT#',
          ':action_taken': 'action_taken',
          ':dismissed': 'dismissed',
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (scanResult.Items) {
      reportsToArchive.push(...scanResult.Items);
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (reportsToArchive.length === 0) {
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
  const s3Key = `${ARCHIVE_PREFIX}/${dateStr}/reports-${timestamp}.json`;

  const archiveData = {
    archivedAt: now.toISOString(),
    archivedBy: adminUserId,
    totalRecords: reportsToArchive.length,
    reports: reportsToArchive,
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

  for (let i = 0; i < reportsToArchive.length; i += 25) {
    const batch = reportsToArchive.slice(i, i + 25);
    const deleteRequests = batch.map((report) => ({
      DeleteRequest: {
        Key: {
          PK: report.PK,
          SK: report.SK,
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

  console.log(`[ArchiveReports] Archived ${reportsToArchive.length} reports to ${s3Key}`);

  return {
    archivedCount: reportsToArchive.length,
    deletedCount,
    s3Key,
    errors,
  };
}
