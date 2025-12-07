/**
 * Notification Handlers
 *
 * API handlers for user notifications
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { NotificationService } from '../services/notification.service';
import { UpdatePreferencesRequest } from '../models/notification.model';
import { getUserId } from '../shared/cognito.utils';

const notificationService = new NotificationService();

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
 * Get user's notifications handler (paginated)
 * GET /v1/notifications
 */
export async function getNotifications(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await notificationService.getNotifications(userId, limit, lastKey);

    // Get unread count
    const unreadCount = await notificationService.getUnreadCount(userId);

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      notifications: result.notifications,
      unreadCount,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting notifications:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get notifications',
    });
  }
}

/**
 * Mark notification as read handler
 * PUT /v1/notifications/:notificationId/read
 */
export async function markAsRead(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let notificationId = event.pathParameters?.notificationId;

    // Fallback: extract from path /notifications/{notificationId}/read
    if (!notificationId && event.path) {
      const match = event.path.match(/\/notifications\/([^/]+)\/read/);
      if (match) {
        notificationId = match[1];
      }
    }

    if (!notificationId) {
      return createResponse(400, {
        error: 'Missing notificationId parameter',
      });
    }

    await notificationService.markAsRead(userId, notificationId);

    return createResponse(200, {
      message: 'Notification marked as read',
    });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);

    if (error.message === 'Notification not found') {
      return createResponse(404, {
        error: 'Notification not found',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to mark notification as read',
    });
  }
}

/**
 * Mark all notifications as read handler
 * PUT /v1/notifications/read-all
 */
export async function markAllAsRead(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    await notificationService.markAllAsRead(userId);

    return createResponse(200, {
      message: 'All notifications marked as read',
    });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    return createResponse(500, {
      error: error.message || 'Failed to mark all notifications as read',
    });
  }
}

/**
 * Get notification preferences handler
 * GET /v1/notifications/preferences
 */
export async function getPreferences(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const preferences = await notificationService.getPreferences(userId);

    return createResponse(200, {
      preferences,
    });
  } catch (error: any) {
    console.error('Error getting notification preferences:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get notification preferences',
    });
  }
}

/**
 * Update notification preferences handler
 * PUT /v1/notifications/preferences
 */
export async function updatePreferences(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const data: UpdatePreferencesRequest = JSON.parse(event.body || '{}');

    // Validate at least one field to update
    if (!data.preferences && data.pushEnabled === undefined && data.emailEnabled === undefined) {
      return createResponse(400, {
        error: 'At least one field must be provided for update',
      });
    }

    const preferences = await notificationService.updatePreferences(userId, data);

    return createResponse(200, {
      message: 'Notification preferences updated successfully',
      preferences,
    });
  } catch (error: any) {
    console.error('Error updating notification preferences:', error);
    return createResponse(500, {
      error: error.message || 'Failed to update notification preferences',
    });
  }
}

/**
 * Get unread notification count handler
 * GET /v1/notifications/unread/count
 */
export async function getUnreadCount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const count = await notificationService.getUnreadCount(userId);

    return createResponse(200, {
      unreadCount: count,
    });
  } catch (error: any) {
    console.error('Error getting unread count:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get unread count',
    });
  }
}

/**
 * Delete notification handler
 * DELETE /v1/notifications/:notificationId
 */
export async function deleteNotification(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let notificationId = event.pathParameters?.notificationId;

    // Fallback: extract from path /notifications/{notificationId}
    if (!notificationId && event.path) {
      const match = event.path.match(/\/notifications\/([^/]+)$/);
      if (match) {
        notificationId = match[1];
      }
    }

    if (!notificationId) {
      return createResponse(400, {
        error: 'Missing notificationId parameter',
      });
    }

    await notificationService.deleteNotification(userId, notificationId);

    return createResponse(200, {
      message: 'Notification deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting notification:', error);

    if (error.message === 'Notification not found') {
      return createResponse(404, {
        error: 'Notification not found',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to delete notification',
    });
  }
}

/**
 * Delete all notifications handler
 * DELETE /v1/notifications
 */
export async function deleteAllNotifications(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const deletedCount = await notificationService.deleteAllNotifications(userId);

    return createResponse(200, {
      message: 'All notifications deleted successfully',
      deletedCount,
    });
  } catch (error: any) {
    console.error('Error deleting all notifications:', error);
    return createResponse(500, {
      error: error.message || 'Failed to delete all notifications',
    });
  }
}
