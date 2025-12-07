import { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

const UNVERIFIED_USER_EXPIRATION_HOURS = 24; // 24 hours

/**
 * PreSignUp Lambda Trigger
 *
 * Triggered before user registration is confirmed.
 * Handles cleanup of unverified users with the same username/email.
 *
 * Use Cases:
 * 1. User registers but doesn't verify email
 * 2. User tries to register again with same username/email
 * 3. Auto-delete unverified users after 24 hours
 *
 * Logic:
 * - Check if username/email already exists in Cognito
 * - If user exists but is UNCONFIRMED and older than 24h → delete and allow new signup
 * - If user exists but is UNCONFIRMED and < 24h → reject with "wait 24h" message
 * - If user exists and is CONFIRMED → reject with "already taken" message
 *
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html
 */
export const handler: PreSignUpTriggerHandler = async (event: PreSignUpTriggerEvent) => {
  console.log('PreSignUp trigger started', {
    username: event.userName,
    email: event.request.userAttributes.email,
    userPoolId: event.userPoolId,
  });

  const { userName, request, userPoolId } = event;
  const { userAttributes } = request;
  const email = userAttributes.email;

  try {
    // Check if username already exists
    const usernameExists = await checkUserExists(userPoolId, 'username', userName);

    if (usernameExists) {
      const action = await handleExistingUser(userPoolId, usernameExists);

      if (action === 'reject') {
        if (usernameExists.UserStatus === 'CONFIRMED') {
          throw new Error(
            `Username "${userName}" is already taken. Please choose a different username.`
          );
        } else {
          const createdDate = usernameExists.UserCreateDate;
          const hoursSinceCreation = createdDate
            ? (Date.now() - createdDate.getTime()) / (1000 * 60 * 60)
            : 0;
          const hoursRemaining = Math.ceil(UNVERIFIED_USER_EXPIRATION_HOURS - hoursSinceCreation);

          throw new Error(
            `Username "${userName}" is pending verification. Please wait ${hoursRemaining} hour(s) or verify your existing account.`
          );
        }
      }
      // If action === 'allow', user was deleted, continue with signup
    }

    // Check if email already exists
    const emailExists = await checkUserExists(userPoolId, 'email', email);

    if (emailExists) {
      const action = await handleExistingUser(userPoolId, emailExists);

      if (action === 'reject') {
        if (emailExists.UserStatus === 'CONFIRMED') {
          throw new Error(
            `Email "${email}" is already registered. Please sign in or use a different email.`
          );
        } else {
          const createdDate = emailExists.UserCreateDate;
          const hoursSinceCreation = createdDate
            ? (Date.now() - createdDate.getTime()) / (1000 * 60 * 60)
            : 0;
          const hoursRemaining = Math.ceil(UNVERIFIED_USER_EXPIRATION_HOURS - hoursSinceCreation);

          throw new Error(
            `Email "${email}" is pending verification. Please wait ${hoursRemaining} hour(s) or verify your existing account.`
          );
        }
      }
      // If action === 'allow', user was deleted, continue with signup
    }

    // Auto-confirm email if admin is creating user
    if (event.triggerSource === 'PreSignUp_AdminCreateUser') {
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = true;
    }

    console.log('PreSignUp trigger completed - allowing signup', {
      username: userName,
      email,
    });

    return event;
  } catch (error) {
    console.error('PreSignUp trigger failed', {
      username: userName,
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Re-throw error to reject signup
    throw error;
  }
};

/**
 * Check if user exists in Cognito User Pool
 *
 * @param userPoolId - Cognito User Pool ID
 * @param attributeName - Attribute to search ('username' or 'email')
 * @param attributeValue - Value to search for
 * @returns User object if found, null otherwise
 */
async function checkUserExists(
  userPoolId: string,
  attributeName: 'username' | 'email',
  attributeValue: string
): Promise<any> {
  try {
    const filter =
      attributeName === 'username'
        ? `username = "${attributeValue}"`
        : `email = "${attributeValue}"`;

    const command = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: filter,
      Limit: 1,
    });

    const response = await cognitoClient.send(command);

    if (response.Users && response.Users.length > 0) {
      return response.Users[0];
    }

    return null;
  } catch (error) {
    console.error('Error checking user existence', {
      attributeName,
      attributeValue,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Handle existing user - delete if unverified and expired, reject otherwise
 *
 * @param userPoolId - Cognito User Pool ID
 * @param user - Existing user object
 * @returns 'allow' if user was deleted, 'reject' otherwise
 */
async function handleExistingUser(userPoolId: string, user: any): Promise<'allow' | 'reject'> {
  const username = user.Username;
  const userStatus = user.UserStatus;
  const createdDate = user.UserCreateDate;

  // If user is confirmed, reject
  if (userStatus === 'CONFIRMED') {
    console.log('User is already confirmed - rejecting signup', {
      username,
      userStatus,
    });
    return 'reject';
  }

  // If user is unconfirmed, check if expired (24 hours)
  if (userStatus === 'UNCONFIRMED' && createdDate) {
    const hoursSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation >= UNVERIFIED_USER_EXPIRATION_HOURS) {
      // User expired - delete and allow new signup
      console.log('Deleting expired unverified user', {
        username,
        hoursSinceCreation,
        createdDate: createdDate.toISOString(),
      });

      try {
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: username,
          })
        );

        console.log('Expired unverified user deleted successfully', { username });
        return 'allow';
      } catch (error) {
        console.error('Failed to delete expired user', {
          username,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // If deletion fails, still reject to prevent duplicate
        return 'reject';
      }
    } else {
      // User not expired yet - reject
      console.log('Unverified user not expired yet - rejecting signup', {
        username,
        hoursSinceCreation,
        hoursRemaining: UNVERIFIED_USER_EXPIRATION_HOURS - hoursSinceCreation,
      });
      return 'reject';
    }
  }

  // Default: reject for safety
  return 'reject';
}
