/**
 * Get Cost Data Handler
 *
 * Admin endpoint to retrieve AWS cost data.
 *
 * GET /admin/monitoring/costs
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId } from '../middleware/admin-auth';
import { CostService } from '../services/cost.service';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';

// Allow dependency injection for testing
let costService: CostService;
let auditLogService: AuditLogService;

export function setCostService(service: CostService) {
  costService = service;
}

export function setAuditLogService(service: AuditLogService) {
  auditLogService = service;
}

/**
 * Get Cost Data Handler
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  // Initialize services if not injected
  if (!costService) {
    costService = new CostService();
  }
  if (!auditLogService) {
    auditLogService = new AuditLogService();
  }

  try {
    // 1. Authorization check
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);

    // 2. Get cost data
    const costs = await costService.getCostData();

    // 3. Check if costs exceed budget
    const budgetWarnings = [];
    if (costs.today.totalCost > costs.budget.daily) {
      budgetWarnings.push(
        `Daily budget exceeded: $${costs.today.totalCost} > $${costs.budget.daily}`
      );
    }
    if (costs.thisWeek.totalCost > costs.budget.weekly) {
      budgetWarnings.push(
        `Weekly budget exceeded: $${costs.thisWeek.totalCost} > $${costs.budget.weekly}`
      );
    }
    if (costs.thisMonth.totalCost > costs.budget.monthly) {
      budgetWarnings.push(
        `Monthly budget exceeded: $${costs.thisMonth.totalCost} > $${costs.budget.monthly}`
      );
    }

    // 4. Log audit action (track who viewed costs)
    await auditLogService.logAction({
      adminUserId,
      adminUsername: 'Admin',
      action: 'VIEW_COST_DATA',
      targetUserId: null,
      targetUsername: null,
      reason: 'Cost monitoring',
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.headers['User-Agent'],
      metadata: {
        todayCost: costs.today.totalCost,
        weekCost: costs.thisWeek.totalCost,
        monthCost: costs.thisMonth.totalCost,
        budgetWarnings,
      },
    });

    // 5. Return cost data with warnings
    return createSuccessResponse(
      200,
      {
        ...costs,
        warnings: budgetWarnings,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}
