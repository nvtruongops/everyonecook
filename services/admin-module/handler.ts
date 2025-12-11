/**
 * Admin Module - Main Lambda Handler
 *
 * Routes incoming requests to appropriate sub-handlers based on path and method.
 * This is the entry point for the Admin Lambda function.
 *
 * @module admin-module/handler
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
  console.log('Admin Module - Incoming request:', {
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

    // User Management endpoints
    if (method === 'GET' && path === '/admin/users') {
      const { handler: getUsersHandler } = await import('./handlers/get-users');
      return await getUsersHandler(event);
    }
    if (method === 'POST' && path === '/admin/users/ban') {
      const { handler: banUserHandler } = await import('./handlers/ban-user');
      return await banUserHandler(event);
    }
    if (method === 'POST' && path === '/admin/users/unban') {
      const { handler: unbanUserHandler } = await import('./handlers/unban-user');
      return await unbanUserHandler(event);
    }
    if (method === 'GET' && path === '/admin/users/banned') {
      const { handler: getBannedUsersHandler } = await import('./handlers/get-banned-users');
      return await getBannedUsersHandler(event);
    }
    if (method === 'POST' && path === '/admin/users/cleanup-inactive') {
      const { handler: cleanupInactiveHandler } = await import('./handlers/cleanup-inactive');
      return await cleanupInactiveHandler(event);
    }
    // Sync users between Cognito and DynamoDB (cleanup orphaned users)
    if (method === 'POST' && path === '/admin/users/sync') {
      const { handler: syncUsersHandler } = await import('./handlers/sync-users');
      return await syncUsersHandler(event);
    }
    // GET user detail with violations and ban history
    if (method === 'GET' && path.match(/^\/admin\/users\/[^/]+$/) && !path.includes('/banned')) {
      const { handler: getUserDetailHandler } = await import('./handlers/get-user-detail');
      return await getUserDetailHandler(event);
    }
    // DELETE user with CASCADE (for test cleanup)
    if (method === 'DELETE' && path.match(/^\/admin\/users\/[^/]+$/)) {
      const { handler: deleteUserHandler } = await import('./handlers/delete-user');
      return await deleteUserHandler(event);
    }

    // Content Moderation endpoints - Posts
    if (method === 'GET' && path === '/admin/posts/reported') {
      const { handler: getReportedPostsHandler } = await import('./handlers/get-reported-posts');
      return await getReportedPostsHandler(event);
    }

    // Content Moderation endpoints - Comments
    if (method === 'GET' && path === '/admin/comments/reported') {
      const { handler: getReportedCommentsHandler } = await import(
        './handlers/get-reported-comments'
      );
      return await getReportedCommentsHandler(event);
    }
    // Get comment detail with all reports
    if (
      method === 'GET' &&
      path.match(/^\/admin\/comments\/[^/]+$/) &&
      !path.includes('/reported')
    ) {
      const { handler: getCommentDetailHandler } = await import('./handlers/get-comment-detail');
      return await getCommentDetailHandler(event);
    }
    // Take moderation action on comment
    if (method === 'POST' && path.match(/^\/admin\/comments\/[^/]+\/action$/)) {
      const { handler: takeCommentActionHandler } = await import('./handlers/take-comment-action');
      return await takeCommentActionHandler(event);
    }
    // Get post detail with all reports
    if (method === 'GET' && path.match(/^\/admin\/posts\/[^/]+$/) && !path.includes('/reported')) {
      const { handler: getPostDetailHandler } = await import('./handlers/get-post-detail');
      return await getPostDetailHandler(event);
    }
    // Take moderation action on post
    if (method === 'POST' && path.match(/^\/admin\/posts\/[^/]+\/action$/)) {
      const { handler: takeActionHandler } = await import('./handlers/take-action');
      return await takeActionHandler(event);
    }
    if (method === 'POST' && path.match(/^\/admin\/posts\/[^/]+\/review$/)) {
      const { handler: reviewPostHandler } = await import('./handlers/review-post');
      return await reviewPostHandler(event);
    }
    if (method === 'DELETE' && path.match(/^\/admin\/posts\/[^/]+$/)) {
      const { handler: deletePostHandler } = await import('./handlers/delete-post');
      return await deletePostHandler(event);
    }
    if (method === 'POST' && path.match(/^\/admin\/posts\/[^/]+\/restore$/)) {
      const { handler: restorePostHandler } = await import('./handlers/restore-post');
      return await restorePostHandler(event);
    }

    // Activity Log endpoint
    if (method === 'GET' && path === '/admin/activity') {
      const { handler: getActivityHandler } = await import('./handlers/get-activity');
      return await getActivityHandler(event);
    }
    // Archive activity logs to S3
    if (method === 'POST' && path === '/admin/activity/archive') {
      const { handler: archiveActivityHandler } = await import('./handlers/archive-activity');
      return await archiveActivityHandler(event);
    }
    // Archive processed reports to S3
    if (method === 'POST' && path === '/admin/reports/archive') {
      const { handler: archiveReportsHandler } = await import('./handlers/archive-reports');
      return await archiveReportsHandler(event);
    }

    // Report Statistics endpoint
    if (method === 'GET' && path === '/admin/reports/stats') {
      const { handler: getReportStatsHandler } = await import('./handlers/get-report-stats');
      return await getReportStatsHandler(event);
    }

    // Ban Status endpoint (public - for login flow)
    if (method === 'GET' && path.match(/^\/admin\/users\/[^/]+\/ban-status$/)) {
      const { handler: checkBanStatusHandler } = await import('./handlers/check-ban-status');
      return await checkBanStatusHandler(event);
    }

    // Appeals endpoints (Admin)
    if (method === 'GET' && path === '/admin/appeals') {
      const { handler: getAppealsHandler } = await import('./handlers/get-appeals');
      return await getAppealsHandler(event);
    }
    if (method === 'POST' && path.match(/^\/admin\/appeals\/[^/]+\/review$/)) {
      const { handler: reviewAppealHandler } = await import('./handlers/review-appeal');
      return await reviewAppealHandler(event);
    }

    // User endpoints (for banned users)
    if (method === 'POST' && path === '/appeals/submit') {
      const { handler: submitAppealHandler } = await import('./handlers/submit-appeal');
      return await submitAppealHandler(event);
    }
    if (method === 'GET' && path === '/users/me/ban-status') {
      const { handler: checkBanStatusHandler } = await import('./handlers/check-ban-status');
      return await checkBanStatusHandler(event);
    }
    // Public endpoint to check ban status by username (for login flow)
    if (method === 'GET' && path === '/users/ban-status') {
      console.log('Routing to check-ban-status-by-username handler');
      const { handler: checkBanStatusByUsernameHandler } = await import(
        './handlers/check-ban-status-by-username'
      );
      const result = await checkBanStatusByUsernameHandler(event);
      console.log('check-ban-status-by-username result:', JSON.stringify(result));
      return result;
    }

    // Feedback endpoints (Admin)
    if (method === 'GET' && path === '/admin/feedbacks') {
      const { handler: getFeedbacksHandler } = await import('./handlers/get-feedbacks');
      return await getFeedbacksHandler(event);
    }
    if (method === 'GET' && path.match(/^\/admin\/feedbacks\/[^/]+$/) && !path.includes('/close')) {
      const { handler: getFeedbackDetailHandler } = await import('./handlers/get-feedback-detail');
      return await getFeedbackDetailHandler(event);
    }
    if (method === 'POST' && path.match(/^\/admin\/feedbacks\/[^/]+\/reply$/)) {
      const { handler: replyFeedbackHandler } = await import('./handlers/reply-feedback');
      return await replyFeedbackHandler(event);
    }
    if (method === 'POST' && path.match(/^\/admin\/feedbacks\/[^/]+\/close$/)) {
      const { handler: closeFeedbackHandler } = await import('./handlers/close-feedback');
      return await closeFeedbackHandler(event);
    }

    // Feedback endpoints (User)
    if (method === 'POST' && path === '/feedback') {
      const { handler: createFeedbackHandler } = await import('./handlers/create-feedback');
      return await createFeedbackHandler(event);
    }
    if (method === 'GET' && path === '/feedback/my') {
      const { handler: getFeedbacksHandler } = await import('./handlers/get-feedbacks');
      return await getFeedbacksHandler(event);
    }
    if (method === 'GET' && path.match(/^\/feedback\/[^/]+$/) && !path.includes('/my')) {
      const { handler: getFeedbackDetailHandler } = await import('./handlers/get-feedback-detail');
      return await getFeedbackDetailHandler(event);
    }
    if (method === 'POST' && path.match(/^\/feedback\/[^/]+\/reply$/)) {
      const { handler: replyFeedbackHandler } = await import('./handlers/reply-feedback');
      return await replyFeedbackHandler(event);
    }

    // System Monitoring endpoints
    if (method === 'GET' && path === '/admin/stats') {
      const { handler: getStatsHandler } = await import('./handlers/get-stats');
      return await getStatsHandler(event);
    }
    if (method === 'GET' && path === '/admin/stats/detailed') {
      const { handler: getDetailedStatsHandler } = await import('./handlers/get-detailed-stats');
      return await getDetailedStatsHandler(event);
    }
    if (method === 'GET' && path === '/admin/health') {
      const { handler: getHealthHandler } = await import('./handlers/get-health');
      return await getHealthHandler(event);
    }
    if (method === 'GET' && path === '/admin/metrics') {
      const { handler: getMetricsHandler } = await import('./handlers/get-metrics');
      return await getMetricsHandler(event);
    }
    if (method === 'GET' && path === '/admin/costs') {
      const { handler: getCostsHandler } = await import('./handlers/get-costs');
      return await getCostsHandler(event);
    }

    // No matching route
    return errorResponse(404, `Route not found: ${method} ${path}`);
  } catch (error: any) {
    console.error('Admin Module - Error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
}
