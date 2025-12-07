/**
 * Get Reported Comments Handler
 *
 * API handler for retrieving comments with reports for admin review.
 * GET /admin/comments/reported
 *
 * Query Parameters:
 * - status: Filter by status (all, pending, reviewed, dismissed, action_taken)
 * - limit: Number of results to return (default: 20, max: 100)
 * - lastKey: Pagination token
 *
 * Report structure in DynamoDB:
 * - PK: COMMENT#{commentId}
 * - SK: REPORT#{reportId}
 *
 * Comment structure:
 * - PK: POST#{postId}
 * - SK: COMMENT#{commentId}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

interface CommentReport {
  reportId: string;
  commentId: string;
  postId: string;
  reporterId: string;
  reporterUsername?: string;
  reason: string;
  details?: string;
  status: string;
  createdAt: string;
  commentContent?: string;
  commentAuthorId?: string;
  commentAuthorUsername?: string;
  reportCount?: number;
}

/**
 * Get Reported Comments Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    // 1. Require admin role
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    console.log('[GetReportedComments] Request', {
      correlationId,
      adminUserId,
      queryParams: event.queryStringParameters,
    });

    // 2. Parse query parameters
    const status = event.queryStringParameters?.status || 'all';
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 100);

    // 3. Scan for comment reports
    // Reports are stored with PK = 'COMMENT#{commentId}' and SK = 'REPORT#{reportId}'
    let lastEvaluatedKey: Record<string, any> | undefined;
    const reportMap = new Map<string, CommentReport>();

    do {
      const scanParams: any = {
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(PK, :commentPrefix) AND begins_with(SK, :reportPrefix)',
        ExpressionAttributeValues: {
          ':commentPrefix': 'COMMENT#',
          ':reportPrefix': 'REPORT#',
        },
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDB.send(new ScanCommand(scanParams));

      for (const item of result.Items || []) {
        const commentId = item.PK?.replace('COMMENT#', '') || '';
        const reportStatus = item.status || 'pending';

        // Filter by status
        if (status !== 'all' && reportStatus !== status) {
          continue;
        }

        // Group reports by commentId
        if (!reportMap.has(commentId)) {
          reportMap.set(commentId, {
            reportId: item.reportId,
            commentId,
            postId: item.postId || '',
            reporterId: item.reporterId,
            reporterUsername: item.reporterUsername,
            reason: item.reason,
            details: item.details,
            status: reportStatus,
            createdAt: item.createdAt,
            reportCount: 1,
          });
        } else {
          const existing = reportMap.get(commentId)!;
          existing.reportCount = (existing.reportCount || 1) + 1;
          // Keep the most recent report
          if (new Date(item.createdAt) > new Date(existing.createdAt)) {
            existing.reportId = item.reportId;
            existing.reporterId = item.reporterId;
            existing.reporterUsername = item.reporterUsername;
            existing.reason = item.reason;
            existing.details = item.details;
            existing.createdAt = item.createdAt;
          }
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // 4. Get comment details for each reported comment
    const reports: CommentReport[] = [];
    for (const [commentId, report] of reportMap) {
      try {
        let foundComment = false;

        // If postId exists in report, query directly
        if (report.postId) {
          const commentResult = await dynamoDB.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: {
                PK: `POST#${report.postId}`,
                SK: `COMMENT#${commentId}`,
              },
            })
          );

          if (commentResult.Item) {
            const comment = commentResult.Item;
            report.commentContent = comment.content;
            report.commentAuthorId = comment.authorId;
            report.commentAuthorUsername = comment.authorName;
            foundComment = true;
          }
        }

        // If not found, scan with pagination
        if (!foundComment) {
          let lastKey: Record<string, any> | undefined;
          let scanCount = 0;

          while (!foundComment && scanCount < 5) {
            const commentScan = await dynamoDB.send(
              new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'SK = :sk',
                ExpressionAttributeValues: {
                  ':sk': `COMMENT#${commentId}`,
                },
                ExclusiveStartKey: lastKey,
              })
            );

            scanCount++;

            if (commentScan.Items && commentScan.Items.length > 0) {
              const comment = commentScan.Items[0];
              report.commentContent = comment.content;
              report.commentAuthorId = comment.authorId;
              report.postId = comment.PK?.replace('POST#', '') || report.postId;
              report.commentAuthorUsername = comment.authorName;
              foundComment = true;
            }

            lastKey = commentScan.LastEvaluatedKey;
            if (!lastKey) break;
          }
        }

        // Get author username if we have authorId but no username
        if (report.commentAuthorId && !report.commentAuthorUsername) {
          try {
            const authorResult = await dynamoDB.send(
              new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                  PK: `USER#${report.commentAuthorId}`,
                  SK: 'PROFILE',
                },
                ProjectionExpression: 'username',
              })
            );
            report.commentAuthorUsername = authorResult.Item?.username;
          } catch {
            // Ignore
          }
        }
      } catch (err) {
        console.warn(`[GetReportedComments] Failed to get comment ${commentId}:`, err);
      }

      reports.push(report);
    }

    // 5. Sort by reportCount DESC, then by createdAt DESC
    reports.sort((a, b) => {
      const countDiff = (b.reportCount || 0) - (a.reportCount || 0);
      if (countDiff !== 0) return countDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 6. Apply limit
    const limitedReports = reports.slice(0, limit);
    const hasMore = reports.length > limit;

    console.log('[GetReportedComments] Retrieved', {
      correlationId,
      count: limitedReports.length,
      total: reports.length,
      status,
    });

    // 7. Return success response
    return createSuccessResponse(
      200,
      {
        reports: limitedReports.map((report) => ({
          ...report,
          preview:
            report.commentContent?.substring(0, 100) +
            ((report.commentContent?.length || 0) > 100 ? '...' : ''),
          severity:
            (report.reportCount || 0) >= 10
              ? 'critical'
              : (report.reportCount || 0) >= 5
                ? 'high'
                : 'normal',
        })),
        count: limitedReports.length,
        hasMore,
        filters: {
          status,
          limit,
        },
      },
      correlationId
    );
  } catch (error) {
    console.error('[GetReportedComments] Error:', error);
    return handleError(error, correlationId);
  }
}
