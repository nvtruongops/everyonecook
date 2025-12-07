/**
 * Authentication Service
 * Handles all Cognito authentication operations
 */

import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
  fetchAuthSession,
  type SignInInput,
  type SignUpInput,
} from 'aws-amplify/auth';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

export interface ResetPasswordData {
  username: string;
  code: string;
  newPassword: string;
}

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface CognitoUser {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
}

class AuthService {
  /**
   * Check ban status with retry logic
   * Returns: { isBanned: boolean, checked: boolean }
   * - isBanned: true if user is banned
   * - checked: true if API call succeeded (false means we should skip Cognito call if user might be banned)
   */
  private async checkBanStatusWithRetry(
    username: string,
    maxRetries: number = 2,
    timeoutMs: number = 5000
  ): Promise<{ isBanned: boolean; checked: boolean }> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/users/ban-status?username=${encodeURIComponent(username)}`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const banData = await response.json();
          const isBanned = banData.data?.isBanned || banData.isBanned || false;
          return { isBanned, checked: true };
        }

        // Non-OK response but not a network error - user likely doesn't exist
        if (response.status === 404) {
          return { isBanned: false, checked: true };
        }
      } catch (error: any) {
        // Last attempt failed
        if (attempt === maxRetries) {
          console.warn('[AuthService] Ban check failed after retries, proceeding with caution');
          return { isBanned: false, checked: false };
        }
        // Wait before retry (exponential backoff: 500ms, 1000ms)
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return { isBanned: false, checked: false };
  }

  /**
   * Login user with username/email and password
   */
  async login(
    credentials: LoginCredentials
  ): Promise<{ success: boolean; requiresVerification?: boolean }> {
    try {
      const { username, password } = credentials;

      // Check ban status BEFORE calling Cognito to avoid 400 errors in console
      // Uses retry logic to ensure we don't miss banned users due to network issues
      const banStatus = await this.checkBanStatusWithRetry(username);

      if (banStatus.isBanned) {
        const bannedError = new Error('USER_BANNED');
        (bannedError as any).code = 'UserBannedException';
        (bannedError as any).originalMessage = 'Tài khoản đã bị khóa';
        throw bannedError;
      }

      // Check if there's already a signed in user
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          // Sign out the current user first
          await signOut();
          this.clearTokens();
        }
      } catch (error) {
        // No user signed in, continue with login
      }

      const signInInput: SignInInput = {
        username,
        password,
      };

      const { isSignedIn, nextStep } = await signIn(signInInput);

      if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        return {
          success: false,
          requiresVerification: true,
        };
      }

      if (isSignedIn) {
        // Force fetch fresh tokens to ensure session is established
        await this.getTokens(true);
        return { success: true };
      }

      return { success: false };
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase() || '';
      const errorName = error.name || '';

      // Check if user is disabled (banned in Cognito)
      const isUserDisabled =
        errorName === 'UserDisabledException' ||
        errorMessage.includes('user is disabled') ||
        errorMessage.includes('disabled');

      // Check if user is banned (from PreAuthentication trigger)
      const isUserBanned =
        errorMessage.includes('banned') ||
        errorMessage.includes('account is temporarily banned') ||
        errorMessage.includes('account has been permanently banned') ||
        errorMessage.includes('account is inactive');

      if (isUserDisabled || isUserBanned) {
        // Throw with special message that login page can detect
        const bannedError = new Error('USER_BANNED');
        (bannedError as any).code = 'UserBannedException';
        (bannedError as any).originalMessage = error.message;
        throw bannedError;
      }

      // User validation errors (expected) - don't log
      const expectedErrors = [
        'UserNotFoundException',
        'NotAuthorizedException',
        'UserNotConfirmedException',
        'UserDisabledException',
        'UserBannedException',
      ];

      if (!expectedErrors.includes(errorName)) {
        // Only log unexpected system errors
        console.warn('[AuthService] Login error:', errorName);
      }
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<{ success: boolean; userId?: string }> {
    try {
      const { username, email, password, fullName } = data;

      const signUpInput: SignUpInput = {
        username,
        password,
        options: {
          userAttributes: {
            email,
            given_name: fullName,
          },
          autoSignIn: true,
        },
      };

      const { isSignUpComplete, userId, nextStep } = await signUp(signUpInput);

      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        return {
          success: true,
          userId: userId,
        };
      }

      return {
        success: isSignUpComplete,
        userId: userId,
      };
    } catch (error: any) {
      // User validation errors (expected) - log as warning
      if (
        error.name === 'UsernameExistsException' ||
        error.name === 'InvalidPasswordException' ||
        error.name === 'InvalidParameterException'
      ) {
        console.warn('[AuthService] Registration validation failed:', error.name);
      } else {
        // System errors (unexpected) - log as error
        console.error('[AuthService] Registration error:', error);
      }
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Confirm user registration with verification code
   */
  async confirmRegistration(username: string, code: string): Promise<boolean> {
    try {
      const { isSignUpComplete } = await confirmSignUp({
        username,
        confirmationCode: code,
      });

      return isSignUpComplete;
    } catch (error: any) {
      // User validation errors (expected) - log as warning
      if (
        error.name === 'CodeMismatchException' ||
        error.name === 'ExpiredCodeException' ||
        error.name === 'NotAuthorizedException'
      ) {
        console.warn('[AuthService] Verification failed:', error.name, error.message);
      } else {
        // System errors (unexpected) - log as error
        console.error('[AuthService] Confirmation error:', error);
      }
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Resend verification code
   */
  async resendVerificationCode(username: string): Promise<void> {
    try {
      await resendSignUpCode({ username });
    } catch (error: any) {
      console.error('Resend code error:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await signOut();
    } catch (error: any) {
      console.error('Logout error:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Request password reset
   */
  async forgotPassword(username: string): Promise<void> {
    try {
      await resetPassword({ username });
    } catch (error: any) {
      console.error('Forgot password error:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Confirm password reset with code
   */
  async confirmPasswordReset(data: ResetPasswordData): Promise<void> {
    try {
      const { username, code, newPassword } = data;
      await confirmResetPassword({
        username,
        confirmationCode: code,
        newPassword,
      });
    } catch (error: any) {
      console.error('Confirm password reset error:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    try {
      // Step 1: Force token refresh to ensure we have a valid session
      const tokens = await this.getTokens(true);

      if (!tokens) {
        throw new Error('Unable to verify authentication. Please sign in again.');
      }

      // Step 2: Verify current user session
      const currentUser = await getCurrentUser();

      if (!currentUser) {
        throw new Error('No authenticated user found. Please sign in again.');
      }

      // Step 3: Attempt password change with validated session
      const { updatePassword } = await import('aws-amplify/auth');
      await updatePassword({ oldPassword, newPassword });
    } catch (error: any) {
      console.error('Change password error:', error);

      // Provide more specific error messages
      if (error.name === 'NotAuthorizedException') {
        // This could be wrong old password OR expired session
        throw new Error(
          'The current password you entered is incorrect. Please verify your password and try again.'
        );
      }

      if (error.message && error.message.includes('sign in again')) {
        throw error; // Re-throw our custom session error
      }

      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<CognitoUser | null> {
    try {
      const { username, userId, signInDetails } = await getCurrentUser();

      // Fetch user attributes to get fullName
      const { fetchUserAttributes } = await import('aws-amplify/auth');
      const attributes = await fetchUserAttributes();

      return {
        userId: userId || '',
        username: username,
        email: signInDetails?.loginId || attributes.email || '',
        emailVerified: true,
        fullName: attributes.given_name || attributes.name || username,
      };
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase() || '';

      // Handle user not found or deleted (stale cache scenario)
      const isUserDeleted =
        error.name === 'UserNotFoundException' ||
        errorMessage.includes('user does not exist') ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('refresh token has been revoked');

      if (isUserDeleted) {
        console.warn('[AuthService] User not found (possibly deleted). Clearing stale session...');
        await this.clearStaleSession();
        return null;
      }

      // Don't log expected authentication errors
      if (error.name !== 'UserUnAuthenticatedException') {
        console.error('Get current user error:', error);
      }
      return null;
    }
  }

  /**
   * Get current session tokens
   */
  async getTokens(forceRefresh: boolean = false): Promise<AuthTokens | null> {
    try {
      const session = await fetchAuthSession({ forceRefresh });

      if (!session.tokens) {
        return null;
      }

      const tokens = {
        accessToken: session.tokens.accessToken.toString(),
        idToken: session.tokens.idToken?.toString() || '',
        refreshToken: '', // Refresh token is managed by Amplify
      };

      return tokens;
    } catch (error: any) {
      // Handle user not found (deleted user with stale cache)
      // Cognito returns 400 with "User does not exist" or similar
      const errorMessage = error.message?.toLowerCase() || '';
      const isUserDeleted =
        error.name === 'UserNotFoundException' ||
        errorMessage.includes('user does not exist') ||
        errorMessage.includes('user not found') ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('refresh token has been revoked');

      if (isUserDeleted) {
        console.warn('[AuthService] User session invalid (possibly deleted). Clearing session...');
        await this.clearStaleSession();
        return null;
      }

      // Don't log expected authentication errors
      if (error.name !== 'UserUnAuthenticatedException') {
        console.error('[AuthService] Get tokens error:', error);
      }
      return null;
    }
  }

  /**
   * Clear stale session when user is deleted but browser has old cache
   */
  private async clearStaleSession(): Promise<void> {
    try {
      // Sign out to clear Amplify's internal cache
      await signOut({ global: false });
    } catch (e) {
      // Ignore errors during cleanup
    }

    // Clear any localStorage items related to Amplify/Cognito
    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('CognitoIdentityServiceProvider') || key.startsWith('amplify'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  }

  /**
   * Get access token for API calls
   * Note: Returns ID token because API Gateway Cognito Authorizer validates ID tokens
   */
  async getAccessToken(forceRefresh: boolean = false): Promise<string | null> {
    try {
      const tokens = await this.getTokens(forceRefresh);

      // Use ID token for API Gateway (Cognito Authorizer validates ID tokens with aud claim)
      const token = tokens?.idToken || tokens?.accessToken;

      if (!token) {
        // If no token and not already forcing refresh, try once more
        if (!forceRefresh) {
          return this.getAccessToken(true);
        }
        return null;
      }

      // Decode token to check expiration
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = new Date(payload.exp * 1000);
        const now = new Date();

        // Check if token is already expired
        if (expiresAt <= now) {
          if (!forceRefresh) {
            return this.getAccessToken(true);
          }
          // If already tried force refresh and still expired, return null
          return null;
        }

        // Refresh token 5 minutes before expiry (proactive refresh)
        const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        const shouldRefresh = expiresAt.getTime() - now.getTime() < bufferTime;

        if (shouldRefresh && !forceRefresh) {
          return this.getAccessToken(true);
        }

        return token;
      } catch (decodeError) {
        console.error('[AuthService] Failed to decode token:', decodeError);
        // If decode fails but we have a token, try to use it anyway
        // The server will reject if invalid
        return token;
      }
    } catch (error) {
      console.error('Get access token error:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await fetchAuthSession();
      return !!session.tokens;
    } catch (error: any) {
      // Handle stale session for deleted users
      const errorMessage = error.message?.toLowerCase() || '';
      const isUserDeleted =
        error.name === 'UserNotFoundException' ||
        errorMessage.includes('user does not exist') ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('refresh token has been revoked');

      if (isUserDeleted) {
        console.warn('[AuthService] Stale session detected, clearing...');
        await this.clearStaleSession();
      }

      // User is not authenticated
      return false;
    }
  }

  /**
   * Clear local token cache (Amplify manages tokens internally)
   */
  private clearTokens(): void {
    // Amplify manages tokens internally, this is a no-op
    // Kept for compatibility with existing code
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(error: any): string {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name || '';

    // Handle Lambda trigger custom errors (ban/suspend messages)
    // These come through as PreAuthenticationTrigger errors with custom messages
    if (error.message) {
      // Check if message contains ban/suspend/inactive keywords
      if (
        errorMessage.includes('banned') ||
        errorMessage.includes('suspend') ||
        errorMessage.includes('inactive')
      ) {
        // Return USER_BANNED so login page can detect and redirect
        return 'USER_BANNED';
      }
    }

    // Check for disabled user (banned in Cognito)
    // Cognito returns NotAuthorizedException with "User is disabled" message
    if (
      errorName === 'UserDisabledException' ||
      errorMessage.includes('user is disabled') ||
      errorMessage.includes('disabled')
    ) {
      return 'USER_BANNED';
    }

    // Handle standard Cognito error codes
    if (errorName === 'UserNotFoundException') {
      return 'User not found. Please check your username.';
    }
    if (errorName === 'NotAuthorizedException') {
      // Double check it's not a disabled/banned user error
      if (errorMessage.includes('disabled') || errorMessage.includes('banned')) {
        return 'USER_BANNED';
      }
      return 'Incorrect username or password.';
    }
    if (errorName === 'UserNotConfirmedException') {
      return 'Please verify your email before logging in.';
    }
    if (errorName === 'CodeMismatchException') {
      return 'Invalid verification code.';
    }
    if (errorName === 'ExpiredCodeException') {
      return 'Verification code has expired. Please request a new one.';
    }
    if (errorName === 'InvalidPasswordException') {
      return 'Password does not meet requirements. Must be at least 12 characters with uppercase, lowercase, numbers, and symbols.';
    }
    if (errorName === 'UsernameExistsException') {
      return 'Username already exists. Please choose a different username.';
    }
    if (errorName === 'InvalidParameterException') {
      return 'Invalid input. Please check your information.';
    }
    if (errorName === 'LimitExceededException') {
      return 'Too many attempts. Please try again later.';
    }

    // Return original error message or generic message
    return error.message || 'An unexpected error occurred. Please try again.';
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
