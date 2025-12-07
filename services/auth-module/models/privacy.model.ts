/**
 * Privacy Model - Type definitions for privacy settings
 *
 * @module models/privacy
 */

/**
 * Privacy level for user profile fields
 */
export enum PrivacyLevel {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private',
}

/**
 * Privacy settings for user profile
 *
 * Field Descriptions:
 * - fullName: User's display name (FIXED: Always PUBLIC - required for search, cannot be changed)
 * - email: User's email (PRIVATE by default, but user can choose PUBLIC or FRIENDS if desired)
 * - birthday: Date of birth (PRIVATE by default, user can change)
 * - gender: User's gender (PRIVATE by default, user can change)
 * - country: User's country (PUBLIC for discovery, user can change)
 * - bio: Profile description (PUBLIC by default, user can change)
 * - avatarUrl: Profile picture URL visibility (PUBLIC = show URL, but S3 OAC still requires signed URL to view)
 * - backgroundUrl: Cover photo URL visibility (PUBLIC = show URL, but S3 OAC still requires signed URL to view)
 * - savedRecipes: Saved/bookmarked recipes visibility (FIXED: Always PRIVATE - like bookmarks, cannot be changed)
 */
export interface PrivacySettings {
  userId: string;
  fullName: PrivacyLevel.PUBLIC; // FIXED: Always PUBLIC for search (cannot be changed)
  email: PrivacyLevel; // User can change
  birthday: PrivacyLevel; // User can change
  gender: PrivacyLevel; // User can change
  country: PrivacyLevel; // User can change
  bio: PrivacyLevel; // User can change
  avatarUrl: PrivacyLevel; // User can change
  backgroundUrl: PrivacyLevel; // User can change
  savedRecipes: PrivacyLevel.PRIVATE; // FIXED: Always PRIVATE (cannot be changed)
  createdAt: number;
  updatedAt: number;
}

/**
 * Default privacy settings for new users
 *
 * Based on requirements.md - Requirement 3:
 * - fullName: PUBLIC (required for user search/discovery - cannot be changed to PRIVATE)
 * - email: PRIVATE (recommended default for security, but user can change to PUBLIC or FRIENDS)
 * - birthday: PRIVATE (user can change to PUBLIC or FRIENDS if desired)
 * - gender: PRIVATE (user can change to PUBLIC or FRIENDS if desired)
 * - country: PUBLIC (helps with discovery)
 * - bio: PUBLIC (profile description)
 * - avatarUrl: PUBLIC (profile picture visible to all, but S3 uses signed URLs for access control)
 * - backgroundUrl: PUBLIC (cover photo visible to all, but S3 uses signed URLs for access control)
 * - savedRecipes: PRIVATE (like Facebook bookmarks - only owner can see by default)
 */
export const DEFAULT_PRIVACY_SETTINGS: Omit<PrivacySettings, 'userId' | 'createdAt' | 'updatedAt'> =
  {
    fullName: PrivacyLevel.PUBLIC, // Required for search (cannot be PRIVATE)
    email: PrivacyLevel.PRIVATE, // Recommended default
    birthday: PrivacyLevel.PRIVATE, // Private by default
    gender: PrivacyLevel.PRIVATE, // Private by default
    country: PrivacyLevel.PUBLIC, // Discovery
    bio: PrivacyLevel.PUBLIC, // Profile description
    avatarUrl: PrivacyLevel.PUBLIC, // Visible but S3 OAC protected
    backgroundUrl: PrivacyLevel.PUBLIC, // Visible but S3 OAC protected
    savedRecipes: PrivacyLevel.PRIVATE, // Private by default (like bookmarks)
  };

/**
 * Privacy update request
 *
 * Note: fullName and savedRecipes are FIXED and cannot be updated
 * - fullName: Always PUBLIC (required for search)
 * - savedRecipes: Always PRIVATE (like bookmarks)
 */
export interface PrivacyUpdateRequest {
  // fullName: FIXED - Always PUBLIC (cannot be changed)
  email?: PrivacyLevel;
  birthday?: PrivacyLevel;
  gender?: PrivacyLevel;
  country?: PrivacyLevel;
  bio?: PrivacyLevel;
  avatarUrl?: PrivacyLevel;
  backgroundUrl?: PrivacyLevel;
  // savedRecipes: FIXED - Always PRIVATE (cannot be changed)
}

/**
 * Relationship type between users
 */
export enum RelationshipType {
  SELF = 'self',
  FRIEND = 'friend',
  STRANGER = 'stranger',
  BLOCKED = 'blocked', // User A blocked User B
}
