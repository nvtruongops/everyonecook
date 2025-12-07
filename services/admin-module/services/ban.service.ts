/**
 * Ban Service
 *
 * Business logic for banning and unbanning users.
 * Handles DynamoDB updates, Cognito operations, and rollback on failure.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UserProfile, createBanSchedule, getBanType } from '../models/ban-user';
import { BanDurationUnit, banDurationToMs, formatBanDuration } from '../models/validation';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const cognito = new CognitoIdentityProviderClient({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const USER_POOL_ID = process.env.USER_POOL_ID!;

export class BanServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'BanServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class BanService {
  /**
   * Ban User
   *
   * Bans a user with specified duration.
   * - Updates DynamoDB profile
   * - Disables Cognito user
   * - Creates BAN_SCHEDULE entity (if temporary)
   * - Handles rollback on failure
   *
   * @param params - Ban parameters
   * @throws BanServiceError if operation fails
   */
  async banUser(params: {
    adminUserId: string;
    targetUserId: string;
    banReason: string;
    banDuration: number; // duration value (0 = permanent)
    banDurationUnit?: BanDurationUnit; // 'minutes' | 'hours' | 'days'
  }): Promise<void> {
    const { adminUserId, targetUserId, banReason, banDuration, banDurationUnit = 'days' } = params;

    // 1. Get user profile
    const profile = await this.getUserProfile(targetUserId);
    if (!profile) {
      throw new BanServiceError(`User not found: ${targetUserId}`, 'TARGET_USER_NOT_FOUND', 404);
    }

    // 2. Check if already banned
    if (profile.isBanned) {
      throw new BanServiceError(`User is already banned: ${targetUserId}`, 'ALREADY_BANNED', 400);
    }

    // 3. Get username for Cognito (Cognito uses username, not userId/sub)
    const cognitoUsername = profile.username || targetUserId;

    const now = Date.now();
    const banDurationMs = banDurationToMs(banDuration, banDurationUnit);
    const banExpiresAt = banDuration > 0 ? now + banDurationMs : null; // null = permanent
    const banDurationDisplay = formatBanDuration(banDuration, banDurationUnit);

    let dynamoDBUpdated = false;
    let cognitoDisabled = false;
    let scheduleCreated = false;

    try {
      // 4. Update DynamoDB profile
      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${targetUserId}`, SK: 'PROFILE' },
          UpdateExpression: `
          SET isBanned = :banned,
              banReason = :reason,
              bannedAt = :now,
              bannedBy = :admin,
              banDuration = :duration,
              banDurationUnit = :durationUnit,
              banDurationDisplay = :durationDisplay,
              banExpiresAt = :expires,
              isActive = :inactive,
              updatedAt = :now
        `,
          ExpressionAttributeValues: {
            ':banned': true,
            ':reason': banReason,
            ':now': now,
            ':admin': adminUserId,
            ':duration': banDuration,
            ':durationUnit': banDurationUnit,
            ':durationDisplay': banDurationDisplay,
            ':expires': banExpiresAt,
            ':inactive': false,
          },
        })
      );
      dynamoDBUpdated = true;

      // 5. Disable Cognito user (use username, not userId)
      console.log('[BanService] Disabling Cognito user:', {
        UserPoolId: USER_POOL_ID,
        Username: cognitoUsername,
      });
      try {
        await cognito.send(
          new AdminDisableUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: cognitoUsername,
          })
        );
        console.log('[BanService] Cognito user disabled successfully');
        cognitoDisabled = true;
      } catch (cognitoError) {
        console.error('[BanService] Failed to disable Cognito user:', cognitoError);
        throw cognitoError;
      }

      // 5. Create BAN_SCHEDULE entity (if temporary ban)
      if (banDuration > 0 && banExpiresAt) {
        const schedule = createBanSchedule(targetUserId, banExpiresAt);
        await dynamoDB.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: schedule,
          })
        );
        scheduleCreated = true;
      }

      console.log('User banned successfully', {
        adminUserId,
        targetUserId,
        banType: getBanType(banDuration),
        banDuration,
        banExpiresAt,
      });
    } catch (error) {
      // Rollback on failure
      console.error('Ban operation failed, rolling back', {
        adminUserId,
        targetUserId,
        error,
        dynamoDBUpdated,
        cognitoDisabled,
        scheduleCreated,
      });

      await this.rollbackBan(targetUserId, cognitoUsername, {
        dynamoDBUpdated,
        cognitoDisabled,
        scheduleCreated,
      });

      throw new BanServiceError(
        `Failed to ban user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BAN_OPERATION_FAILED',
        500
      );
    }
  }

  /**
   * Unban User
   *
   * Unbans a user (manual or automatic).
   * - Updates DynamoDB profile
   * - Enables Cognito user
   * - Deletes BAN_SCHEDULE entity
   *
   * @param params - Unban parameters
   * @throws BanServiceError if operation fails
   */
  async unbanUser(params: {
    targetUserId: string;
    source: 'manual' | 'auto';
    adminUserId?: string;
  }): Promise<void> {
    const { targetUserId, source, adminUserId } = params;

    // 1. Get user profile
    const profile = await this.getUserProfile(targetUserId);
    if (!profile) {
      throw new BanServiceError(`User not found: ${targetUserId}`, 'TARGET_USER_NOT_FOUND', 404);
    }

    // 2. Check if banned
    if (!profile.isBanned) {
      throw new BanServiceError(`User is not banned: ${targetUserId}`, 'NOT_BANNED', 400);
    }

    // 3. Get username for Cognito (Cognito uses username, not userId/sub)
    const cognitoUsername = profile.username || targetUserId;

    const now = Date.now();

    try {
      // 4. Update DynamoDB profile
      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${targetUserId}`, SK: 'PROFILE' },
          UpdateExpression: `
          SET isBanned = :unbanned,
              isActive = :active,
              updatedAt = :now
          REMOVE banReason, bannedAt, bannedBy, banDuration, banExpiresAt
        `,
          ExpressionAttributeValues: {
            ':unbanned': false,
            ':active': true,
            ':now': now,
          },
        })
      );

      // 5. Enable Cognito user (use username, not userId)
      await cognito.send(
        new AdminEnableUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: cognitoUsername,
        })
      );

      // 5. Delete BAN_SCHEDULE entity (if exists)
      try {
        await dynamoDB.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `BAN_SCHEDULE#${targetUserId}`,
              SK: 'UNBAN_TASK',
            },
          })
        );
      } catch (error) {
        // Ignore if not found
        console.warn('BAN_SCHEDULE not found (already deleted or permanent ban)', {
          targetUserId,
        });
      }

      console.log('User unbanned successfully', {
        targetUserId,
        source,
        adminUserId,
      });
    } catch (error) {
      console.error('Unban operation failed', {
        targetUserId,
        source,
        error,
      });

      throw new BanServiceError(
        `Failed to unban user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNBAN_OPERATION_FAILED',
        500
      );
    }
  }

  /**
   * Get User Profile
   *
   * Retrieves user profile from DynamoDB.
   *
   * @param userId - User ID
   * @returns User profile or null if not found
   */
  private async getUserProfile(userId: string): Promise<UserProfile | null> {
    const result = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      })
    );

    return (result.Item as UserProfile) || null;
  }

  /**
   * Rollback Ban
   *
   * Rolls back partial ban operation on failure.
   *
   * @param userId - User ID
   * @param cognitoUsername - Cognito username for rollback
   * @param state - Operation state
   */
  private async rollbackBan(
    userId: string,
    cognitoUsername: string,
    state: {
      dynamoDBUpdated: boolean;
      cognitoDisabled: boolean;
      scheduleCreated: boolean;
    }
  ): Promise<void> {
    try {
      // Rollback DynamoDB update
      if (state.dynamoDBUpdated) {
        await dynamoDB.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
            UpdateExpression: `
            SET isBanned = :unbanned,
                isActive = :active,
                updatedAt = :now
            REMOVE banReason, bannedAt, bannedBy, banDuration, banExpiresAt
          `,
            ExpressionAttributeValues: {
              ':unbanned': false,
              ':active': true,
              ':now': Date.now(),
            },
          })
        );
      }

      // Rollback Cognito disable (use username, not userId)
      if (state.cognitoDisabled) {
        await cognito.send(
          new AdminEnableUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: cognitoUsername,
          })
        );
      }

      // Rollback BAN_SCHEDULE creation
      if (state.scheduleCreated) {
        await dynamoDB.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `BAN_SCHEDULE#${userId}`,
              SK: 'UNBAN_TASK',
            },
          })
        );
      }

      console.log('Ban operation rolled back successfully', { userId });
    } catch (error) {
      console.error('Rollback failed', { userId, error });
      // Don't throw - best effort rollback
    }
  }
}
