/**
 * User Model - Type definitions for user entities
 *
 * @module models/user
 */

/**
 * User profile entity
 */
export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  bio?: string;
  birthday?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  country?: string;
  isActive: boolean;
  isBanned: boolean;
  isSuspended: boolean;
  lastLoginAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * User registration request
 */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

/**
 * User login request
 *
 * Note: username field accepts both username and email
 * Cognito is configured with signInAliases: { username: true, email: true }
 */
export interface LoginRequest {
  username: string; // Can be username OR email
  password: string;
}

/**
 * User login response
 */
export interface LoginResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  username: string;
}

/**
 * Password reset confirmation
 */
export interface PasswordResetConfirmation {
  username: string;
  confirmationCode: string;
  newPassword: string;
}

/**
 * Profile update request
 */
export interface ProfileUpdateRequest {
  fullName?: string;
  bio?: string;
  birthday?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  country?: string;
}

/**
 * User search filters
 *
 * Note: Search is only by username (partial match)
 */
export interface UserSearchFilters {
  query: string; // Username search query (required)
  limit?: number; // Max results per page (default 20, max 50)
  nextToken?: string; // Pagination token
}

/**
 * User search result
 */
export interface UserSearchResult {
  users: UserProfile[];
  nextToken?: string;
}
