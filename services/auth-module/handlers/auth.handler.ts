/**
 * Authentication Handlers
 *
 * Implements Cognito authentication operations:
 * - Login (USER_PASSWORD_AUTH)
 * - Register (SignUp)
 * - Password Reset (ForgotPassword, ConfirmForgotPassword)
 * - Token Refresh (RefreshToken)
 *
 * @module handlers/auth
 * @see .kiro/specs/project-restructure/user-profile-design.md - Authentication section
 * @see .kiro/specs/project-restructure/security-architecture.md - Cognito integration
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AuthFlowType,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  PasswordResetRequest,
  PasswordResetConfirmation,
} from '../models/user.model';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

// Initialize DynamoDB client for username lookup
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Validate environment variables
 */
function validateEnvironment(): void {
  if (!USER_POOL_ID) {
    throw new Error('USER_POOL_ID environment variable is required');
  }
  if (!USER_POOL_CLIENT_ID) {
    throw new Error('USER_POOL_CLIENT_ID environment variable is required');
  }
}

/**
 * Login handler - Authenticate user with username/email and password
 *
 * Cognito Configuration: signInAliases: { username: true, email: true }
 * This means users can login with EITHER username OR email
 *
 * Flow:
 * 1. Validate input
 * 2. Call Cognito InitiateAuth with USER_PASSWORD_AUTH
 * 3. Return tokens (access, id, refresh)
 *
 * @param request - Login request with username/email and password
 * @returns Login response with tokens
 * @throws Error if authentication fails
 *
 * @example
 * // Login with username
 * await login({ username: 'john_doe', password: 'MyP@ssw0rd123' });
 *
 * // Login with email
 * await login({ username: 'john@example.com', password: 'MyP@ssw0rd123' });
 */
export async function login(request: LoginRequest): Promise<LoginResponse> {
  validateEnvironment();

  // Validate input
  if (!request.username || !request.password) {
    throw new Error('Username or email and password are required');
  }

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: request.username,
        PASSWORD: request.password,
      },
    });

    const response = await cognitoClient.send(command);

    // Check if authentication requires additional challenges
    if (response.ChallengeName) {
      throw new Error(`Authentication requires additional challenge: ${response.ChallengeName}`);
    }

    // Extract tokens
    const authResult = response.AuthenticationResult;
    if (!authResult || !authResult.AccessToken || !authResult.IdToken) {
      throw new Error('Authentication failed: No tokens returned');
    }

    return {
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      refreshToken: authResult.RefreshToken || '',
      expiresIn: authResult.ExpiresIn || 3600,
      tokenType: authResult.TokenType || 'Bearer',
    };
  } catch (error: any) {
    // Handle Cognito-specific errors
    if (error.name === 'NotAuthorizedException') {
      throw new Error('Invalid username or password');
    }
    if (error.name === 'UserNotFoundException') {
      throw new Error('User not found');
    }
    if (error.name === 'UserNotConfirmedException') {
      throw new Error('User email not verified. Please check your email for verification code.');
    }
    if (error.name === 'PasswordResetRequiredException') {
      throw new Error('Password reset required. Please reset your password.');
    }
    if (error.name === 'TooManyRequestsException') {
      throw new Error('Too many login attempts. Please try again later.');
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Register handler - Create new user account
 *
 * Flow:
 * 1. Validate input (username, email, password, fullName)
 * 2. Call Cognito SignUp
 * 3. User receives verification email
 * 4. PostConfirmation trigger creates DynamoDB profile
 *
 * @param request - Registration request
 * @returns Success message with userId
 * @throws Error if registration fails
 */
export async function register(
  request: RegisterRequest
): Promise<{ userId: string; message: string }> {
  validateEnvironment();

  // Validate input
  if (!request.username || !request.email || !request.password || !request.fullName) {
    throw new Error('Username, email, password, and fullName are required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(request.email)) {
    throw new Error('Invalid email format');
  }

  // Validate username format (alphanumeric, 3-20 chars)
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(request.username)) {
    throw new Error(
      'Username must be 3-20 characters and contain only letters, numbers, and underscores'
    );
  }

  try {
    const command = new SignUpCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: request.username,
      Password: request.password,
      UserAttributes: [
        {
          Name: 'email',
          Value: request.email,
        },
        {
          Name: 'given_name', // Maps to fullName
          Value: request.fullName,
        },
      ],
    });

    const response = await cognitoClient.send(command);

    return {
      userId: response.UserSub || '',
      message: 'Registration successful. Please check your email for verification code.',
    };
  } catch (error: any) {
    // Handle Cognito-specific errors
    if (error.name === 'UsernameExistsException') {
      throw new Error('Username already exists');
    }
    if (error.name === 'InvalidPasswordException') {
      throw new Error(
        'Password does not meet requirements: minimum 12 characters, uppercase, lowercase, digits, and symbols'
      );
    }
    if (error.name === 'InvalidParameterException') {
      throw new Error('Invalid registration parameters. Please check your input.');
    }
    if (error.name === 'TooManyRequestsException') {
      throw new Error('Too many registration attempts. Please try again later.');
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Forgot Password handler - Initiate password reset
 *
 * Flow:
 * 1. Validate username
 * 2. Call Cognito ForgotPassword
 * 3. User receives reset code via email
 *
 * @param request - Password reset request with username
 * @returns Success message
 * @throws Error if request fails
 */
export async function forgotPassword(request: PasswordResetRequest): Promise<{ message: string }> {
  validateEnvironment();

  // Validate input
  if (!request.username) {
    throw new Error('Username is required');
  }

  try {
    const command = new ForgotPasswordCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: request.username,
    });

    await cognitoClient.send(command);

    return {
      message: 'Password reset code sent to your email. Please check your inbox.',
    };
  } catch (error: any) {
    // Handle Cognito-specific errors
    if (error.name === 'UserNotFoundException') {
      // Don't reveal if user exists (security best practice)
      return {
        message:
          'If the username exists, a password reset code has been sent to the registered email.',
      };
    }
    if (error.name === 'InvalidParameterException') {
      throw new Error('Invalid username format');
    }
    if (error.name === 'TooManyRequestsException') {
      throw new Error('Too many password reset attempts. Please try again later.');
    }
    if (error.name === 'LimitExceededException') {
      throw new Error('Password reset limit exceeded. Please try again later.');
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Confirm Forgot Password handler - Complete password reset
 *
 * Flow:
 * 1. Validate input (username, code, new password)
 * 2. Call Cognito ConfirmForgotPassword
 * 3. Password is updated
 *
 * @param request - Password reset confirmation with code and new password
 * @returns Success message
 * @throws Error if confirmation fails
 */
export async function confirmForgotPassword(
  request: PasswordResetConfirmation
): Promise<{ message: string }> {
  validateEnvironment();

  // Validate input
  if (!request.username || !request.confirmationCode || !request.newPassword) {
    throw new Error('Username, confirmation code, and new password are required');
  }

  try {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: request.username,
      ConfirmationCode: request.confirmationCode,
      Password: request.newPassword,
    });

    await cognitoClient.send(command);

    return {
      message: 'Password reset successful. You can now login with your new password.',
    };
  } catch (error: any) {
    // Handle Cognito-specific errors
    if (error.name === 'CodeMismatchException') {
      throw new Error('Invalid confirmation code. Please check the code and try again.');
    }
    if (error.name === 'ExpiredCodeException') {
      throw new Error('Confirmation code has expired. Please request a new password reset.');
    }
    if (error.name === 'InvalidPasswordException') {
      throw new Error(
        'New password does not meet requirements: minimum 12 characters, uppercase, lowercase, digits, and symbols'
      );
    }
    if (error.name === 'UserNotFoundException') {
      throw new Error('User not found');
    }
    if (error.name === 'TooManyFailedAttemptsException') {
      throw new Error('Too many failed attempts. Please request a new password reset code.');
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Refresh Token handler - Get new access token using refresh token
 *
 * Flow:
 * 1. Validate refresh token
 * 2. Call Cognito InitiateAuth with REFRESH_TOKEN_AUTH
 * 3. Return new access and id tokens
 *
 * @param refreshToken - Refresh token from previous login
 * @returns New tokens (access and id)
 * @throws Error if refresh fails
 */
export async function refreshToken(refreshToken: string): Promise<LoginResponse> {
  validateEnvironment();

  // Validate input
  if (!refreshToken) {
    throw new Error('Refresh token is required');
  }

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: USER_POOL_CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    const response = await cognitoClient.send(command);

    // Extract tokens
    const authResult = response.AuthenticationResult;
    if (!authResult || !authResult.AccessToken || !authResult.IdToken) {
      throw new Error('Token refresh failed: No tokens returned');
    }

    return {
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      refreshToken: refreshToken, // Refresh token doesn't change
      expiresIn: authResult.ExpiresIn || 3600,
      tokenType: authResult.TokenType || 'Bearer',
    };
  } catch (error: any) {
    // Handle Cognito-specific errors
    if (error.name === 'NotAuthorizedException') {
      throw new Error('Invalid or expired refresh token. Please login again.');
    }
    if (error.name === 'TooManyRequestsException') {
      throw new Error('Too many token refresh attempts. Please try again later.');
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Check Username Availability handler - OPTIMIZED
 *
 * Validates username format and checks if it's available
 * This is a public endpoint (no authentication required)
 *
 * OPTIMIZATION STRATEGIES:
 * 1. Early validation (no network call)
 * 2. DynamoDB GSI lookup (sub-100ms) - PRIMARY
 * 3. AdminGetUser fallback (10x faster than ListUsers)
 * 4. In-memory cache (5min TTL)
 *
 * Flow:
 * 1. Validate username format (instant)
 * 2. Check in-memory cache (instant)
 * 3. Query DynamoDB GSI2 (PK = USERNAME#{username}) - FAST
 * 4. Fallback to Cognito AdminGetUser if needed
 * 5. Cache result for 5 minutes
 *
 * @param username - Username to check
 * @returns Object with valid and available flags
 */

// In-memory cache for username checks (5min TTL)
const usernameCache = new Map<string, { available: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function checkUsernameAvailability(username: string): Promise<{
  valid: boolean;
  available: boolean;
  error?: string;
}> {
  const startTime = Date.now();
  validateEnvironment();

  // STEP 1: Validate username format (instant - no network call)
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  if (!usernameRegex.test(username)) {
    console.log(`[Username Check] Invalid format: ${username} (${Date.now() - startTime}ms)`);
    return {
      valid: false,
      available: false,
      error: 'Username must be 3-30 characters and contain only letters, numbers, and underscores',
    };
  }

  // STEP 2: Check in-memory cache (instant)
  const normalizedUsername = username.toLowerCase();
  const cached = usernameCache.get(normalizedUsername);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Username Check] Cache HIT: ${username} (${Date.now() - startTime}ms)`);
    return {
      valid: true,
      available: cached.available,
    };
  }

  try {
    // STEP 3: Query DynamoDB GSI2 (fastest - sub-100ms)
    // GSI2: PK = USERNAME#{username}, SK = PROFILE
    const dynamoStart = Date.now();
    const queryCommand = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :username',
      ExpressionAttributeValues: {
        ':username': `USERNAME#${normalizedUsername}`,
      },
      Limit: 1,
      ProjectionExpression: 'PK', // Only fetch PK for minimal data transfer
    });

    const queryResult = await dynamoDB.send(queryCommand);
    const dynamoTime = Date.now() - dynamoStart;

    // If found in DynamoDB, username is taken
    const available = !queryResult.Items || queryResult.Items.length === 0;

    // Cache the result
    usernameCache.set(normalizedUsername, {
      available,
      timestamp: Date.now(),
    });

    console.log(
      `[Username Check] DynamoDB: ${username} = ${available ? 'AVAILABLE' : 'TAKEN'} (dynamo: ${dynamoTime}ms, total: ${Date.now() - startTime}ms)`
    );

    return {
      valid: true,
      available,
    };
  } catch (error: any) {
    console.error('Error checking username in DynamoDB:', error);

    // STEP 4: Fallback to Cognito AdminGetUser (faster than ListUsers)
    try {
      const cognitoStart = Date.now();
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      });

      await cognitoClient.send(getUserCommand);

      // If no error, user exists - username is taken
      const available = false;

      // Cache the result
      usernameCache.set(normalizedUsername, {
        available,
        timestamp: Date.now(),
      });

      console.log(
        `[Username Check] Cognito Fallback: ${username} = TAKEN (cognito: ${Date.now() - cognitoStart}ms, total: ${Date.now() - startTime}ms)`
      );

      return {
        valid: true,
        available,
      };
    } catch (cognitoError: any) {
      // UserNotFoundException means username is available
      if (cognitoError.name === 'UserNotFoundException') {
        const available = true;

        // Cache the result
        usernameCache.set(normalizedUsername, {
          available,
          timestamp: Date.now(),
        });

        console.log(
          `[Username Check] Cognito Fallback: ${username} = AVAILABLE (total: ${Date.now() - startTime}ms)`
        );

        return {
          valid: true,
          available,
        };
      }

      console.error('Error checking username availability (Cognito fallback):', cognitoError);
      throw new Error('Failed to check username availability');
    }
  }
}
