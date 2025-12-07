/**
 * Notification Service
 *
 * Handles in-app notifications for admin operations.
 * Saves notifications directly to DynamoDB for users to see when they log in.
 *
 * NOTE: SES/SNS removed - all notifications are in-app only.
 * Users can submit appeals through the appeal system.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Notification Types for Admin Actions
 */
export type AdminNotificationType =
  | 'account_banned'
  | 'account_unbanned'
  | 'post_deleted'
  | 'post_restored'
  | 'comment_deleted';

export class NotificationService {
  /**
   * Create In-App Notification - saves to DynamoDB
   */
  private async createNotification(
    recipientId: string,
    type: AdminNotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
    canAppeal: boolean = false
  ): Promise<void> {
    const notificationId = uuidv4();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days

    const appealDeadline = canAppeal
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${recipientId}`,
            SK: `NOTIFICATION#${now}#${notificationId}`,
            notificationId,
            recipientId,
            type,
            title,
            message,
            metadata,
            isRead: false,
            canAppeal,
            appealDeadline,
            createdAt: now,
            ttl,
            entityType: 'NOTIFICATION',
          },
        })
      );
      console.log('[NotificationService] Created:', { notificationId, recipientId, type });
    } catch (error) {
      console.error('[NotificationService] Failed:', error);
    }
  }

  /**
   * Send Ban Notification (in-app)
   */
  async sendBanNotification(
    userId: string,
    _email: string,
    banReason: string,
    banDuration: number
  ): Promise<void> {
    const banType = banDuration === 0 ? 'vĩnh viễn' : `${banDuration} ngày`;
    await this.createNotification(
      userId,
      'account_banned',
      '⚠️ Tài khoản bị tạm khóa',
      `Tài khoản đã bị khóa ${banType}. Lý do: ${banReason}`,
      { banReason, banDuration },
      true
    );
  }

  /**
   * Send Unban Notification (in-app)
   */
  async sendUnbanNotification(
    userId: string,
    _email: string,
    source: 'manual' | 'auto'
  ): Promise<void> {
    const msg = source === 'auto' ? 'Thời gian khóa đã kết thúc.' : 'Tài khoản đã được mở khóa.';
    await this.createNotification(
      userId,
      'account_unbanned',
      '✅ Tài khoản đã khôi phục',
      msg,
      { source },
      false
    );
  }

  /**
   * Send Post Deleted Notification (in-app)
   */
  async sendPostDeletedNotification(userId: string, postId: string, reason: string): Promise<void> {
    await this.createNotification(
      userId,
      'post_deleted',
      '🗑️ Bài viết đã bị xóa',
      `Bài viết bị xóa do vi phạm. Lý do: ${reason}`,
      { postId, reason },
      true
    );
  }

  /**
   * Send Post Restored Notification (in-app)
   */
  async sendPostRestoredNotification(
    userId: string,
    postId: string,
    reason: string
  ): Promise<void> {
    await this.createNotification(
      userId,
      'post_restored',
      '✅ Bài viết đã khôi phục',
      `Bài viết đã được khôi phục. Lý do: ${reason}`,
      { postId, reason },
      false
    );
  }

  /**
   * Send Inactivity Warning (in-app) - kept for compatibility
   */
  async sendInactivityWarning(
    userId: string,
    _email: string,
    gracePeriodDays: number
  ): Promise<void> {
    await this.createNotification(
      userId,
      'account_banned',
      '⚠️ Cảnh báo không hoạt động',
      `Tài khoản sẽ bị xóa sau ${gracePeriodDays} ngày nếu không đăng nhập.`,
      { gracePeriodDays },
      false
    );
  }
}
