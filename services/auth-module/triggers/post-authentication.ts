import { PostAuthenticationTriggerEvent, PostAuthenticationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'EveryoneCook';
const INACTIVITY_THRESHOLD_DAYS = 90; // 3 months
const GRACE_PERIOD_DAYS = 7; // 7 days grace period before deletion

/**
 * PostAuthentication Lambda Trigger
 *
 * Triggered after successful user authentication.
 * Updates lastLoginAt timestamp and handles inactive user cleanup logic.
 *
 * TTL Strategy for Inactive Users:
 * 1. If user was inactive > 90 days (3 months):
 *    - Set TTL = now + 7 days (grace period)
 *    - Send warning email about account deletion
 * 2. If user is active (login within 90 days):
 *    - Remove TTL (if exists)
 *    - Reset lastLoginAt
 *
 * Auto-Unban Logic:
 * - If temporary ban has expired, automatically unban user
 *
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Inactive User Cleanup TTL Strategy
 * @see .kiro/specs/project-restructure/security-architecture.md - Authentication security
 */
export const handler: PostAuthenticationTriggerHandler = async (
  event: PostAuthenticationTriggerEvent
) => {
  console.log('PostAuthentication trigger started', {
    userId: event.userName,
    userPoolId: event.userPoolId,
  });

  const { userName: userId } = event;

  const now = Date.now();
  const inactivityThreshold = now - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  try {
    // Get user profile to check lastLoginAt
    const result = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      })
    );

    const profile = result.Item;

    if (!profile) {
      console.warn('User profile not found', { userId });
      // Profile will be created by PostConfirmation trigger
      return event;
    }

    const lastLoginAt = profile.lastLoginAt || 0;
    const wasInactive = lastLoginAt < inactivityThreshold;

    // Check if temporary ban has expired (auto-unban)
    if (profile.isBanned && profile.banExpiresAt && now >= profile.banExpiresAt) {
      console.log('Auto-unbanning user - temporary ban expired', {
        userId,
        banExpiresAt: new Date(profile.banExpiresAt).toISOString(),
      });

      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
          },
          UpdateExpression: `
            SET isBanned = :unbanned,
                banReason = :null,
                bannedAt = :null,
                bannedBy = :null,
                banDuration = :null,
                banExpiresAt = :null,
                isActive = :active,
                lastLoginAt = :now,
                updatedAt = :now
            REMOVE ttl
          `,
          ExpressionAttributeValues: {
            ':unbanned': false,
            ':null': null,
            ':active': true,
            ':now': now,
          },
          ConditionExpression: 'attribute_exists(username)',
        })
      );

      console.log('User auto-unbanned successfully', { userId });

      return event;
    }

    // Handle inactive user cleanup logic
    // Only update if profile exists (has username attribute) to prevent creating orphan records
    if (wasInactive) {
      // User was inactive > 90 days - set TTL for 7 days grace period
      const ttl = Math.floor((now + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) / 1000);

      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
          },
          UpdateExpression: 'SET lastLoginAt = :now, ttl = :ttl, updatedAt = :now',
          ExpressionAttributeValues: {
            ':now': now,
            ':ttl': ttl,
          },
          ConditionExpression: 'attribute_exists(username)',
        })
      );

      console.log('Inactive user - TTL set for grace period', {
        userId,
        lastLoginAt: new Date(lastLoginAt).toISOString(),
        ttl: new Date(ttl * 1000).toISOString(),
        gracePeriodDays: GRACE_PERIOD_DAYS,
      });
    } else {
      // User is active - remove TTL if exists
      await dynamoDB.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
          },
          UpdateExpression: 'SET lastLoginAt = :now, updatedAt = :now REMOVE ttl',
          ExpressionAttributeValues: {
            ':now': now,
          },
          ConditionExpression: 'attribute_exists(username)',
        })
      );

      console.log('Active user - lastLoginAt updated, TTL removed', { userId });
    }

    console.log('PostAuthentication trigger completed successfully', { userId });

    return event;
  } catch (error) {
    console.error('PostAuthentication trigger failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Don't throw error - allow user to continue
    // lastLoginAt update can be retried later
    return event;
  }
};


