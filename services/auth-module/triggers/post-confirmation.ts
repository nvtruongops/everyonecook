import { PostConfirmationTriggerEvent, PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'EveryoneCook';

/**
 * PostConfirmation Lambda Trigger
 *
 * Triggered after user confirms their email address.
 * Creates 2 DynamoDB entities:
 * 1. Core Profile (PK=USER#{userId}, SK=PROFILE)
 * 2. Privacy Settings (PK=USER#{userId}, SK=PRIVACY_SETTINGS)
 *
 * Schema Design:
 * - PK: USER#{userId} (Cognito sub - guaranteed unique)
 * - userId field stores Cognito sub (primary identifier)
 * - username stored in profile for display
 * - GSI1: USERNAME#{username} -> USER#{userId} for username lookup
 *
 * Important: Birthday, gender, country are NULL initially.
 * User completes these fields later in onboarding.
 *
 * Note: AI_PREFERENCES removed - replaced by PREFERENCES#STABLE and PREFERENCES#FREQUENT
 * These are created on-demand when user first accesses preferences.
 *
 * @see .kiro/specs/project-restructure/user-profile-design.md - Profile schema
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Privacy settings
 * @see .kiro/specs/project-restructure/database-architecture.md - Entity patterns
 */
export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent
) => {
  console.log('PostConfirmation trigger started', {
    username: event.userName,
    userId: event.request.userAttributes.sub,
    userPoolId: event.userPoolId,
  });

  const { userName, request } = event;
  const { userAttributes } = request;

  // Schema Change: Username is now the primary identifier
  // userName = username (e.g., 'nvtruongops') - used as PK
  // sub = Cognito unique user ID (e.g., 'f91a959c-...') - stored in userId field for traceability
  const username = userName.toLowerCase(); // Normalize to lowercase
  const userId = userAttributes.sub; // Keep for Cognito integration

  const now = Date.now();

  try {
    // 1. Create Core Profile
    await dynamoDB.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`, // Use userId (Cognito sub) as PK - guaranteed unique
          SK: 'PROFILE',
          entityType: 'USER_PROFILE',

          // Identity Fields
          userId, // Cognito sub (primary identifier)
          username, // Username (for display and search)
          email: userAttributes.email,
          fullName: userAttributes.given_name || userAttributes['cognito:username'],

          // Profile Fields (NULL initially - completed in onboarding)
          avatarUrl: null,
          backgroundUrl: null,
          bio: '',
          birthday: null,
          gender: null,
          country: null,

          // Metadata (Backend Managed)
          isActive: true,
          isBanned: false,
          banReason: null,
          bannedAt: null,
          bannedBy: null,
          banDuration: null,
          banExpiresAt: null,

          // Statistics (Auto-Calculated)
          totalPosts: 0,
          totalRecipes: 0,
          totalFriends: 0,

          // Timestamps
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,

          // TTL for inactive users (null initially)
          ttl: null,

          // GSI1 for username lookup: USERNAME#{username} -> USER#{userId}
          GSI1PK: `USERNAME#${username}`,
          GSI1SK: `USER#${userId}`,

          // GSI2 for username search (used by @mention feature)
          GSI2PK: `USERNAME#${username}`,
          GSI2SK: 'PROFILE',
        },
      })
    );

    console.log('Core profile created', { username, userId });

    // 2. Create Privacy Settings
    await dynamoDB.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`, // Use userId as PK
          SK: 'PRIVACY_SETTINGS',
          entityType: 'PRIVACY_SETTINGS',

          // Field-Level Privacy (Default Settings)
          fieldPrivacy: {
            fullName: 'public',
            email: 'private',
            birthday: 'private',
            gender: 'private',
            country: 'public',
            avatarUrl: 'public',
            backgroundUrl: 'public',
            bio: 'public',
            statistics: 'public',
          },

          // Timestamps
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    console.log('Privacy settings created', { username, userId });

    // NOTE: AI_PREFERENCES removed - replaced by PREFERENCES#STABLE and PREFERENCES#FREQUENT
    // These are created on-demand when user first accesses preferences
    // See: preferences.handler.ts - getStablePreferencesHandler, getFrequentPreferencesHandler

    return event;
  } catch (error) {
    console.error('PostConfirmation trigger failed', {
      username,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Don't throw error - allow user to continue
    // Profile creation can be retried later
    return event;
  }
};
