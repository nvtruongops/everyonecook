import { PreAuthenticationTriggerEvent, PreAuthenticationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'EveryoneCook';

/**
 * PreAuthentication Lambda Trigger
 *
 * Triggered before user authentication.
 * Checks if user is banned or suspended and rejects login if so.
 *
 * Ban Types:
 * - Temporary Ban: User can login after ban expires (auto-unban via TTL)
 * - Permanent Ban: User cannot login until manually unbanned by admin
 *
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Admin Ban TTL Strategy
 * @see .kiro/specs/project-restructure/security-architecture.md - Authentication security
 */
export const handler: PreAuthenticationTriggerHandler = async (
  event: PreAuthenticationTriggerEvent
) => {
  console.log('PreAuthentication trigger started', {
    userId: event.userName,
    userPoolId: event.userPoolId,
  });

  const { userName: userId } = event;

  try {
    // Get user profile to check ban status
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
      // Allow login - profile will be created by PostConfirmation trigger
      return event;
    }

    // Check if user is banned
    if (profile.isBanned) {
      const now = Date.now();
      const banExpiresAt = profile.banExpiresAt;

      // Check if temporary ban has expired
      if (banExpiresAt && now >= banExpiresAt) {
        console.log('Temporary ban expired - allowing login', {
          userId,
          banExpiresAt: new Date(banExpiresAt).toISOString(),
        });
        // Allow login - PostAuthentication trigger will unban user
        return event;
      }

      // User is still banned
      const banType = banExpiresAt ? 'temporary' : 'permanent';
      const banMessage =
        banType === 'temporary'
          ? `Your account is temporarily banned until ${new Date(banExpiresAt).toISOString()}. Reason: ${profile.banReason || 'No reason provided'}`
          : `Your account has been permanently banned. Reason: ${profile.banReason || 'No reason provided'}. Please contact support.`;

      console.warn('User login rejected - account banned', {
        userId,
        banType,
        banReason: profile.banReason,
        banExpiresAt: banExpiresAt ? new Date(banExpiresAt).toISOString() : null,
      });

      throw new Error(banMessage);
    }

    // Check if user is inactive (not active)
    if (!profile.isActive) {
      console.warn('User login rejected - account inactive', { userId });
      throw new Error(
        'Your account is inactive. Please contact support to reactivate your account.'
      );
    }

    console.log('PreAuthentication trigger completed - user allowed', { userId });

    return event;
  } catch (error) {
    console.error('PreAuthentication trigger failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Re-throw error to reject login
    throw error;
  }
};
