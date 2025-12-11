/**
 * DynamoDB Stream Archive Handler
 *
 * Listens to DynamoDB Stream and archives deleted records to S3.
 * Triggered by TTL deletions or manual deletions.
 *
 * Archives:
 * - ADMIN_ACTION records -> archives/activity/ttl/
 * - REPORT records -> archives/reports/ttl/
 */

import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';

const s3Client = new S3Client({});

const ARCHIVE_BUCKET = 'everyonecook-cdn-logs-dev';

interface ArchiveRecord {
  deletedAt: string;
  deleteType: 'TTL' | 'MANUAL';
  data: any;
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  const activityRecords: ArchiveRecord[] = [];
  const reportRecords: ArchiveRecord[] = [];

  for (const record of event.Records) {
    // Only process REMOVE events (deletions)
    if (record.eventName !== 'REMOVE') {
      continue;
    }

    const oldImage = record.dynamodb?.OldImage;
    if (!oldImage) {
      continue;
    }

    // Unmarshall DynamoDB record to plain object
    const data = unmarshall(oldImage as Record<string, AttributeValue>);
    const pk = data.PK as string;

    // Determine delete type (TTL vs manual)
    // TTL deletions have userIdentity.type = 'Service' and principalId = 'dynamodb.amazonaws.com'
    const deleteType = isTTLDeletion(record) ? 'TTL' : 'MANUAL';

    const archiveRecord: ArchiveRecord = {
      deletedAt: new Date().toISOString(),
      deleteType,
      data,
    };

    // Route to appropriate archive
    if (pk.startsWith('ADMIN_ACTION#')) {
      activityRecords.push(archiveRecord);
    } else if (data.SK?.startsWith('REPORT#')) {
      reportRecords.push(archiveRecord);
    }
  }

  // Archive activity records
  if (activityRecords.length > 0) {
    await appendToArchive('activity', activityRecords);
  }

  // Archive report records
  if (reportRecords.length > 0) {
    await appendToArchive('reports', reportRecords);
  }

  console.log(
    `[StreamArchive] Processed ${event.Records.length} records: ` +
      `${activityRecords.length} activities, ${reportRecords.length} reports`
  );
}

/**
 * Check if deletion was caused by TTL
 */
function isTTLDeletion(record: DynamoDBRecord): boolean {
  // TTL deletions have specific user identity
  const userIdentity = (record as any).userIdentity;
  return (
    userIdentity?.type === 'Service' &&
    userIdentity?.principalId === 'dynamodb.amazonaws.com'
  );
}

/**
 * Append records to daily archive file in S3
 * Creates new file if doesn't exist, appends if exists
 */
async function appendToArchive(
  type: 'activity' | 'reports',
  records: ArchiveRecord[]
): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const weekNumber = getWeekNumber(now);
  const s3Key = `archives/${type}/ttl/${now.getUTCFullYear()}/week-${weekNumber}/${dateStr}.json`;

  let existingRecords: ArchiveRecord[] = [];

  // Try to get existing file
  try {
    const existing = await s3Client.send(
      new GetObjectCommand({
        Bucket: ARCHIVE_BUCKET,
        Key: s3Key,
      })
    );
    const body = await existing.Body?.transformToString();
    if (body) {
      const parsed = JSON.parse(body);
      existingRecords = parsed.records || [];
    }
  } catch (err: any) {
    // File doesn't exist yet, that's fine
    if (err.name !== 'NoSuchKey') {
      console.error(`Error reading existing archive: ${err.message}`);
    }
  }

  // Append new records
  const allRecords = [...existingRecords, ...records];

  const archiveData = {
    lastUpdated: now.toISOString(),
    totalRecords: allRecords.length,
    records: allRecords,
  };

  await s3Client.send(
    new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: s3Key,
      Body: JSON.stringify(archiveData, null, 2),
      ContentType: 'application/json',
    })
  );

  console.log(`[StreamArchive] Appended ${records.length} ${type} records to ${s3Key}`);
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
