/**
 * Report Handlers
 *
 * API handlers for content reporting
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ReportService } from '../services/report.service';
import { ReportRequest, ReportReason } from '../models/report.model';

// Create service instance (can be mocked in tests)
let reportService: ReportService;

function getReportService(): ReportService {
  if (!reportService) {
    reportService = new ReportService();
  }
  return reportService;
}

/**
 * Helper function to create API response
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Helper function to get user ID from event
 */
function getUserId(event: APIGatewayProxyEvent): string {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    throw new Error('User not authenticated');
  }
  return userId;
}

/**
 * Validate report reason
 */
function isValidReportReason(reason: string): reason is ReportReason {
  return ['spam', 'harassment', 'inappropriate', 'misinformation', 'other'].includes(reason);
}

/**
 * Report content handler
 * POST /v1/posts/:postId/report
 * POST /v1/comments/:commentId/report
 */
export async function reportContent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const data = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!data.targetId || !data.targetType || !data.reason) {
      return createResponse(400, {
        error: 'Missing required fields: targetId, targetType, reason',
      });
    }

    // Validate targetType
    if (data.targetType !== 'post' && data.targetType !== 'comment') {
      return createResponse(400, {
        error: 'Invalid targetType. Must be "post" or "comment"',
      });
    }

    // Validate reason
    if (!isValidReportReason(data.reason)) {
      return createResponse(400, {
        error:
          'Invalid reason. Must be one of: spam, harassment, inappropriate, misinformation, other',
      });
    }

    const request: ReportRequest = {
      targetId: data.targetId,
      targetType: data.targetType,
      reason: data.reason,
      details: data.details,
    };

    const report = await getReportService().reportContent(userId, request);

    return createResponse(201, {
      message: 'Report submitted successfully. Thank you for helping keep our community safe.',
      report: {
        reportId: report.reportId,
        status: report.status,
        createdAt: report.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error reporting content:', error);

    if (error.message === 'You have already reported this content') {
      return createResponse(409, {
        error: 'You have already reported this content',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to submit report',
    });
  }
}
