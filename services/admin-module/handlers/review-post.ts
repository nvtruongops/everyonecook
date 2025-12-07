/**
 * Review Post Handler
 *
 * API handler for reviewing reported posts (APPROVE or REJECT).
 * POST /v1/admin/moderation/review-post
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ModerationService } from '../services/moderation.service';
import { AuditLogService } from '../services/audit-log.service';
import { requireAdminRole, getAdminUserId, getRequestIP } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { validateInput } from '../models/validation';
import { ReviewPostSchema } from '../models/moderation';
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
 * Review Post Handler
 *
 * Admin reviews a reported post and takes action:
 * - APPROVE: Clear reports, set status to 'active'
 * - REJECT: Hide post, set status to 'hidden'
 *
 * Request Body:
 * {
 *   "postId": "post-123",
 *   "action": "APPROVE" | "REJECT",
 *   "reason": "Reason for the action"
 * }
 *
 * @param event - API Gateway event
 * @returns API Gateway response with review result
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = uuidv4();

  try {
    // 1. Require admin role
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);
    const ipAddress = getRequestIP(event);

    console.log('Review post request', {
      correlationId,
      adminUserId,
      ipAddress,
    });

    // 2. Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validated = validateInput(ReviewPostSchema, body);

    console.log('Review post validated', {
      correlationId,
      postId: validated.postId,
      action: validated.action,
    });

    // 3. Review post
    const result = await getModerationService().reviewPost(
      validated.postId,
      validated.action,
      adminUserId,
      validated.reason
    );

    // 4. Log admin action
    await getAuditLogService().logAction({
      adminUserId,
      adminUsername: event.requestContext.authorizer?.claims?.['cognito:username'] || 'Unknown',
      action: validated.action === 'APPROVE' ? 'APPROVE_POST' : 'REJECT_POST',
      targetUserId: 'POST', // We don't have authorId here, would need to fetch
      reason: validated.reason,
      ipAddress,
      userAgent: event.headers['User-Agent'],
      metadata: {
        postId: validated.postId,
        newStatus: result.status,
      },
    });

    console.log('Post reviewed successfully', {
      correlationId,
      postId: validated.postId,
      action: validated.action,
      newStatus: result.status,
    });

    // 5. Return success response
    return createSuccessResponse(
      200,
      {
        message: `Post ${validated.action === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
        result: {
          postId: result.postId,
          status: result.status,
          action: result.action,
        },
      },
      correlationId
    );
  } catch (error) {
    console.error('Error in review post handler:', error);
    return handleError(error, correlationId);
  }
}
