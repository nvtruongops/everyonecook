/**
 * Get Business Metrics Handler
 *
 * Admin endpoint to retrieve business metrics.
 *
 * GET /admin/monitoring/metrics
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { MetricsService } from '../services/metrics.service';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';

// Allow dependency injection for testing
let metricsService: MetricsService;
let auditLogService: AuditLogService;

export function setMetricsService(service: MetricsService) {
  metricsService = service;
}

export function setAuditLogService(service: AuditLogService) {
  auditLogService = service;
}

/**
 * Get Business Metrics Handler
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  // Initialize services if not injected
  if (!metricsService) {
    metricsService = new MetricsService();
  }
  if (!auditLogService) {
    auditLogService = new AuditLogService();
  }

  try {
    // 1. Authorization check
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // 2. Get business metrics
    const metrics = await metricsService.getBusinessMetrics();

    // 3. Log audit action (track who viewed metrics)
    await auditLogService.logAction({
      adminUserId,
      adminUsername: 'Admin',
      action: 'VIEW_BUSINESS_METRICS',
      targetUserId: null,
      targetUsername: null,
      reason: 'Business monitoring',
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.headers['User-Agent'],
      metadata: {
        totalUsers: metrics.user.totalUsers,
        totalPosts: metrics.content.totalPosts,
        aiCallsToday: metrics.ai.aiCallsToday,
      },
    });

    // 4. Return metrics data
    return createSuccessResponse(200, metrics, correlationId);
  } catch (error) {
    return handleError(error, correlationId);
  }
}
