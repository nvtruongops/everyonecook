/**
 * Get Reported Posts Handler
 *
 * API handler for retrieving posts with reports for admin review.
 * GET /admin/posts/reported
 *
 * Query Parameters:
 * - minReports: Minimum number of reports (default: 1 for admin view)
 * - status: Filter by post status (all, under_review, hidden, active)
 * - limit: Number of results to return (default: 20, max: 100)
 * - lastKey: Pagination token
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ModerationService } from '../services/moderation.service';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { validateInput } from '../models/validation';
import { GetReportedPostsSchema } from '../models/moderation';
import { v4 as uuidv4 } from 'uuid';

// Create service instance
let moderationService: ModerationService;

function getModerationService(): ModerationService {
  if (!moderationService) {
    moderationService = new ModerationService();
  }
  return moderationService;
}

/**
 * Get Reported Posts Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    // 1. Require admin role
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    console.log('[GetReportedPosts] Request', {
      correlationId,
      adminUserId,
      queryParams: event.queryStringParameters,
    });

    // 2. Parse and validate query parameters
    const queryParams = {
      minReports: event.queryStringParameters?.minReports
        ? parseInt(event.queryStringParameters.minReports, 10)
        : 1, // Default to 1 for admin to see all reported posts
      status: (event.queryStringParameters?.status as 'all' | 'under_review' | 'hidden') || 'all',
      limit: event.queryStringParameters?.limit
        ? parseInt(event.queryStringParameters.limit, 10)
        : 20,
      lastEvaluatedKey: event.queryStringParameters?.lastKey,
    };

    const validated = validateInput(GetReportedPostsSchema, queryParams);

    // 3. Get reported posts
    const posts = await getModerationService().getReportedPosts(
      validated.minReports,
      validated.status,
      validated.limit
    );

    // 4. Calculate pagination (simple offset-based for now)
    const hasMore = posts.length === validated.limit;

    console.log('[GetReportedPosts] Retrieved', {
      correlationId,
      count: posts.length,
      minReports: validated.minReports,
      status: validated.status,
    });

    // 5. Return success response with enhanced data
    // Map to reports format for frontend compatibility
    // Use reportStatus from service (based on pending report count) instead of post.status
    const reports = posts.map((post: any) => ({
      reportId: `post-${post.postId}`,
      postId: post.postId,
      authorId: post.authorId,
      authorUsername: post.authorUsername,
      reason: 'Nhiều báo cáo',
      description: post.caption,
      preview: post.caption?.substring(0, 100) + (post.caption?.length > 100 ? '...' : ''),
      reportCount: post.reportCount || 0,
      pendingReportCount: post.pendingReportCount || 0,
      // Use reportStatus (pending/action_taken) based on actual report records
      status: post.reportStatus || (post.pendingReportCount > 0 ? 'pending' : 'action_taken'),
      postStatus: post.status, // Keep original post status (active/hidden/deleted)
      createdAt: post.createdAt,
      severity: post.reportCount >= 100 ? 'critical' : post.reportCount >= 10 ? 'high' : 'normal',
    }));

    return createSuccessResponse(
      200,
      {
        reports,
        posts: reports, // Keep for backward compatibility
        count: reports.length,
        hasMore,
        filters: {
          minReports: validated.minReports,
          status: validated.status,
          limit: validated.limit,
        },
      },
      correlationId
    );
  } catch (error) {
    console.error('[GetReportedPosts] Error:', error);
    return handleError(error, correlationId);
  }
}
