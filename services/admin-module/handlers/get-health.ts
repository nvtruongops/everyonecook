/**
 * Get System Health Handler
 *
 * Admin endpoint to check system health.
 *
 * GET /admin/monitoring/health
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { HealthService } from '../services/health.service';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';

// Allow dependency injection for testing
let healthService: HealthService;
let auditLogService: AuditLogService;

export function setHealthService(service: HealthService) {
  healthService = service;
}

export function setAuditLogService(service: AuditLogService) {
  auditLogService = service;
}

/**
 * Get System Health Handler
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  // Initialize services if not injected
  if (!healthService) {
    healthService = new HealthService();
  }
  if (!auditLogService) {
    auditLogService = new AuditLogService();
  }

  try {
    // 1. Authorization check
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // 2. Get system health
    const health = await healthService.getSystemHealth();

    // 3. Log audit action (track who viewed system health)
    await auditLogService.logAction({
      adminUserId,
      adminUsername: 'Admin',
      action: 'VIEW_SYSTEM_HEALTH',
      targetUserId: null,
      targetUsername: null,
      reason: 'System monitoring',
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.headers['User-Agent'],
      metadata: {
        overallStatus: health.overall,
        unhealthyServices: health.services
          .filter((s) => s.status === 'unhealthy')
          .map((s) => s.service),
      },
    });

    // 4. Return health data
    return createSuccessResponse(200, health, correlationId);
  } catch (error) {
    return handleError(error, correlationId);
  }
}
