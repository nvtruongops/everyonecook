/**
 * Delete Post Handler
 *
 * API handler for deleting posts (soft delete).
 * DELETE /v1/admin/moderation/posts/:postId
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ModerationService } from '../services/moderation.service';
import { AuditLogService } from '../services/audit-log.service';
import { requireAdminRole, getAdminUserId, getRequestIP } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { validateInput } from '../models/validation';
import { DeletePostSchema } from '../models/moderation';
import { v4 as uuidv4 } from 'uuid';

// Create service instances
let moderationService: ModerationService;
let auditLogService: AuditLogService;

function getModerationService(): ModerationService {
  if (!moderationService) {
    moderationService = new ModerationService();
  }
  return moderationService;
}

function getAuditLogService(): AuditLogService {
  if (!auditLogService) {
    auditLogService = new AuditLogService();
  }
  return auditLogService;
}

/**
 * Delete Post Handler
 *
 * Soft delete a post (set status to 'deleted', keep data for audit).
 * Images will be deleted asynchronously via SQS.
 *
 * Request Body:
 * {
 *   "postId": "post-123",
 *   "reason": "Reason for deletion",
 *   "notifyAuthor": true
 * }
 *
 * @param event - API Gateway event
 * @returns API Gateway response with deletion result
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    // 1. Require admin role
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);
    const ipAddress = getRequestIP(event);

    console.log('Delete post request', {
      correlationId,
      adminUserId,
      ipAddress,
    });

    // 2. Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validated = validateInput(DeletePostSchema, body);

    console.log('Delete post validated', {
      correlationId,
      postId: validated.postId,
      notifyAuthor: validated.notifyAuthor,
    });

    // 3. Delete post
    const result = await getModerationService().deletePost(
      validated.postId,
      adminUserId,
      validated.reason
    );

    // 4. Log admin action
    await getAuditLogService().logAction({
      adminUserId,
      adminUsername: event.requestContext.authorizer?.claims?.['cognito:username'] || 'Unknown',
      action: 'DELETE_POST',
      targetUserId: 'POST', // We don't have authorId here, would need to fetch
      reason: validated.reason,
      ipAddress,
      userAgent: event.headers['User-Agent'],
      metadata: {
        postId: validated.postId,
        notifyAuthor: validated.notifyAuthor,
      },
    });

    console.log('Post deleted successfully', {
      correlationId,
      postId: validated.postId,
      status: result.status,
    });

    // TODO: Send notification to author if notifyAuthor is true
    // This would be implemented with NotificationQueue

    // 5. Return success response
    return createSuccessResponse(
      200,
      {
        message: 'Post deleted successfully',
        result: {
          postId: result.postId,
          status: result.status,
        },
      },
      correlationId
    );
  } catch (error) {
    console.error('Error in delete post handler:', error);
    return handleError(error, correlationId);
  }
}
