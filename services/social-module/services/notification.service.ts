/**
 * Notification Service
 *
 * Business logic for user notifications
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  Notification,
  NotificationPreferences,
  UpdatePreferencesRequest,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../models/notification.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Notification Service Class
 */
export class NotificationService {
  /**
   * Get user's notifications (paginated)
   * @param userId - User's Cognito sub (userId)
   */
  async getNotifications(
    userId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<{ notifications: Notification[]; lastKey?: Record<string, unknown> }> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notification)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':notification': 'NOTIFICATION#',
        },
        ScanIndexForward: false, // Sort by timestamp descending (newest first)
        Limit: limit,
        ExclusiveStartKey: lastKey,
      })
    );

    // Populate actor info for each notification
    const notifications = await Promise.all(
      (result.Items || []).map(async (item) => {
        const notification = item as Notification;

        // Fetch actor profile if actorId exists
        if (notification.actorId) {
          try {
            const actorResult = await docClient.send(
              new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                  PK: `USER#${notification.actorId}`,
                  SK: 'PROFILE',
                },
                ProjectionExpression: 'fullName, username, avatarUrl',
              })
            );

            if (actorResult.Item) {
              notification.actorName =
                actorResult.Item.fullName || actorResult.Item.username || 'Someone';
              notification.actorAvatar = actorResult.Item.avatarUrl;
            }
          } catch (error) {
            console.error('Failed to fetch actor profile:', error);
            notification.actorName = 'Someone';
          }
        }

        return notification;
      })
    );

    return {
      notifications,
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get unread notifications count
   * @param userId - User's Cognito sub (userId)
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notification)',
        FilterExpression: 'isRead = :false',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':notification': 'NOTIFICATION#',
          ':false': false,
        },
        Select: 'COUNT',
      })
    );

    return result.Count || 0;
  }

  /**
   * Mark notification as read
   * @param userId - User's Cognito sub (userId)
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    // Get notification to find SK
    const notifications = await this.getNotifications(userId, 100);
    const notification = notifications.notifications.find(
      (n) => n.notificationId === notificationId
    );

    if (!notification) {
      throw new Error('Notification not found');
    }

    // Update isRead status
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: notification.PK,
          SK: notification.SK,
        },
        UpdateExpression: 'SET isRead = :true',
        ExpressionAttributeValues: {
          ':true': true,
        },
      })
    );
  }

  /**
   * Mark all notifications as read
   * @param userId - User's Cognito sub (userId)
   */
  async markAllAsRead(userId: string): Promise<void> {
    // Get all unread notifications
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notification)',
        FilterExpression: 'isRead = :false',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':notification': 'NOTIFICATION#',
          ':false': false,
        },
      })
    );

    // Update each notification
    const updatePromises = (result.Items || []).map((item) =>
      docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: item.PK,
            SK: item.SK,
          },
          UpdateExpression: 'SET isRead = :true',
          ExpressionAttributeValues: {
            ':true': true,
          },
        })
      )
    );

    await Promise.all(updatePromises);
  }

  /**
   * Get notification preferences
   * @param userId - User's Cognito sub (userId)
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'NOTIFICATION_PREFERENCES',
        },
      })
    );

    // Return existing preferences or create default
    if (result.Item) {
      return result.Item as NotificationPreferences;
    }

    // Create default preferences
    const defaultPreferences: NotificationPreferences = {
      PK: `USER#${userId}`,
      SK: 'NOTIFICATION_PREFERENCES',
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
      emailEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: defaultPreferences,
      })
    );

    return defaultPreferences;
  }

  /**
   * Update notification preferences
   * @param userId - User's Cognito sub (userId)
   */
  async updatePreferences(
    userId: string,
    request: UpdatePreferencesRequest
  ): Promise<NotificationPreferences> {
    // Get current preferences
    const currentPreferences = await this.getPreferences(userId);

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: Record<string, any> = {};

    // Update individual preference types
    if (request.preferences) {
      const updatedPreferences = {
        ...currentPreferences.preferences,
        ...request.preferences,
      };
      updateExpressions.push('preferences = :preferences');
      expressionAttributeValues[':preferences'] = updatedPreferences;
    }

    // Update push enabled
    if (request.pushEnabled !== undefined) {
      updateExpressions.push('pushEnabled = :pushEnabled');
      expressionAttributeValues[':pushEnabled'] = request.pushEnabled;
    }

    // Update email enabled
    if (request.emailEnabled !== undefined) {
      updateExpressions.push('emailEnabled = :emailEnabled');
      expressionAttributeValues[':emailEnabled'] = request.emailEnabled;
    }

    // Always update updatedAt
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    // Update preferences
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'NOTIFICATION_PREFERENCES',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    // Return updated preferences
    return await this.getPreferences(userId);
  }

  /**
   * Delete a notification
   * @param userId - User's Cognito sub (userId)
   * @param notificationId - The notification's unique ID
   *
   * Note: SK format is "NOTIFICATION#{timestamp}", not "NOTIFICATION#{notificationId}"
   * So we need to query all notifications and filter by notificationId field
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    // Query all notifications for this user and filter by notificationId
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'notificationId = :notificationId',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'NOTIFICATION#',
          ':notificationId': notificationId,
        },
      })
    );

    const notification = result.Items?.[0];
    if (!notification) {
      throw new Error('Notification not found');
    }

    // Delete from DynamoDB
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: notification.PK,
          SK: notification.SK,
        },
      })
    );
  }

  /**
   * Delete all notifications for a user
   * @param userId - User's Cognito sub (userId)
   * @returns Number of deleted notifications
   */
  async deleteAllNotifications(userId: string): Promise<number> {
    // Query all notifications for this user
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'NOTIFICATION#',
        },
      })
    );

    const notifications = result.Items || [];
    if (notifications.length === 0) {
      return 0;
    }

    // Delete all notifications in parallel
    const deletePromises = notifications.map((notification) =>
      docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: notification.PK,
            SK: notification.SK,
          },
        })
      )
    );

    await Promise.all(deletePromises);
    return notifications.length;
  }
}
