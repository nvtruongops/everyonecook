/**
 * Get Report Statistics Handler
 *
 * Admin endpoint to get report statistics by status and type.
 * Scans DynamoDB for REPORT entities and counts by status/type.
 *
 * GET /admin/reports/stats?type=post|comment|all&from=timestamp&to=timestamp
 *
 * Flow:
 * 1. User sees inappropriate content -> clicks Report
 * 2. User selects reason (spam, harassment, inappropriate, misinformation, other)
 * 3. User optionally adds details -> Submit
 * 4. Report saved with status 'pending'
 * 5. Admin dashboard shows report counts by status
 * 6. Admin can filter by: type (post/comment), time range, status
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { validateInput } from '../models/validation';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Report Status Types (simplified)
 * - pending: Chờ xử lý
 * - action_taken: Đã xử lý (bao gồm cả dismissed)
 */
type ReportStatus = 'pending' | 'action_taken';

/**
 * Report Target Types
 */
type ReportTargetType = 'post' | 'comment';

/**
 * Report Reason Types
 */
type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other';

/**
 * Query Schema
 */
const GetReportStatsSchema = z.object({
  type: z.enum(['post', 'comment', 'all']).optional().default('all'),
  from: z.string().optional(), // ISO timestamp
  to: z.string().optional(), // ISO timestamp
});

/**
 * Report Statistics Interface
 */
interface ReportStats {
  byStatus: {
    pending: number;
    action_taken: number;
  };
  byType: {
    post: number;
    comment: number;
  };
  byReason: {
    spam: number;
    harassment: number;
    inappropriate: number;
    misinformation: number;
    other: number;
  };
  total: number;
  recentReports: ReportSummary[];
}

/**
 * Report Summary for recent reports list
 */
interface ReportSummary {
  reportId: string;
  targetId: string;
  targetType: ReportTargetType;
  reporterId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
}

/**
 * Get Report Statistics Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `admin-${Date.now()}`;

  console.log('[GetReportStats] Starting handler', { correlationId });

  try {
    // 1. Authorization check
    requireAdminRole(event);

    // 2. Validate query parameters
    const query = validateInput(GetReportStatsSchema, {
      type: event.queryStringParameters?.type || 'all',
      from: event.queryStringParameters?.from,
      to: event.queryStringParameters?.to,
    });

    console.log('[GetReportStats] Query params:', query);

    // 3. Initialize stats
    const stats: ReportStats = {
      byStatus: {
        pending: 0,
        action_taken: 0,
      },
      byType: {
        post: 0,
        comment: 0,
      },
      byReason: {
        spam: 0,
        harassment: 0,
        inappropriate: 0,
        misinformation: 0,
        other: 0,
      },
      total: 0,
      recentReports: [],
    };

    // 4. Scan for all reports
    // Reports are stored with SK starting with 'REPORT#'
    // PK is either 'POST#{postId}' or 'COMMENT#{commentId}'
    let lastEvaluatedKey: Record<string, any> | undefined;
    const allReports: any[] = [];

    do {
      const scanParams: any = {
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(SK, :reportPrefix)',
        ExpressionAttributeValues: {
          ':reportPrefix': 'REPORT#',
        },
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDB.send(new ScanCommand(scanParams));

      // Process reports
      for (const item of result.Items || []) {
        // Determine target type from PK
        const targetType: ReportTargetType = item.PK?.startsWith('POST#') ? 'post' : 'comment';

        // Filter by type if specified
        if (query.type !== 'all' && targetType !== query.type) {
          continue;
        }

        // Filter by time range if specified
        const createdAt = item.createdAt;
        if (query.from && createdAt < query.from) {
          continue;
        }
        if (query.to && createdAt > query.to) {
          continue;
        }

        // Count by status - gộp reviewed, resolved, dismissed vào action_taken
        const rawStatus = item.status || 'pending';
        stats.total++;

        if (rawStatus === 'pending') {
          stats.byStatus.pending++;
        } else {
          // action_taken, reviewed, resolved, dismissed đều tính là đã xử lý
          stats.byStatus.action_taken++;
        }

        // Normalize status for report summary
        const status: ReportStatus = rawStatus === 'pending' ? 'pending' : 'action_taken';

        // Count by type
        stats.byType[targetType]++;

        // Count by reason
        const reason = (item.reason as ReportReason) || 'other';
        if (reason in stats.byReason) {
          stats.byReason[reason]++;
        } else {
          stats.byReason.other++;
        }

        // Collect for recent reports
        allReports.push({
          reportId: item.reportId,
          targetId: item.targetId,
          targetType,
          reporterId: item.reporterId,
          reason,
          status,
          createdAt,
        });
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // 5. Sort and get recent reports (top 10 newest pending)
    stats.recentReports = allReports
      .filter((r) => r.status === 'pending')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    console.log('[GetReportStats] Stats calculated:', {
      total: stats.total,
      pending: stats.byStatus.pending,
    });

    // 6. Calculate percentages
    const calculatePercentage = (count: number) =>
      stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

    // 7. Return success response
    return createSuccessResponse(
      200,
      {
        stats,
        summary: {
          total: stats.total,
          pendingCount: stats.byStatus.pending,
          needsAttention: stats.byStatus.pending > 0,
        },
        breakdown: {
          byStatus: {
            pending: {
              count: stats.byStatus.pending,
              percentage: calculatePercentage(stats.byStatus.pending),
            },
            action_taken: {
              count: stats.byStatus.action_taken,
              percentage: calculatePercentage(stats.byStatus.action_taken),
            },
          },
          byType: {
            post: {
              count: stats.byType.post,
              percentage: calculatePercentage(stats.byType.post),
            },
            comment: {
              count: stats.byType.comment,
              percentage: calculatePercentage(stats.byType.comment),
            },
          },
          byReason: {
            spam: {
              count: stats.byReason.spam,
              percentage: calculatePercentage(stats.byReason.spam),
            },
            harassment: {
              count: stats.byReason.harassment,
              percentage: calculatePercentage(stats.byReason.harassment),
            },
            inappropriate: {
              count: stats.byReason.inappropriate,
              percentage: calculatePercentage(stats.byReason.inappropriate),
            },
            misinformation: {
              count: stats.byReason.misinformation,
              percentage: calculatePercentage(stats.byReason.misinformation),
            },
            other: {
              count: stats.byReason.other,
              percentage: calculatePercentage(stats.byReason.other),
            },
          },
        },
        filters: {
          type: query.type,
          from: query.from,
          to: query.to,
        },
        generatedAt: new Date().toISOString(),
      },
      correlationId
    );
  } catch (error) {
    console.error('[GetReportStats] Handler error:', error);
    return handleError(error, correlationId);
  }
}
