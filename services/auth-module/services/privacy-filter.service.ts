/**
 * Privacy Filter Service - Filter user profile based on privacy settings
 *
 * @module services/privacy-filter
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Privacy Filtering
 *
 * IMPORTANT: Avatar/Background Privacy Logic
 *
 * Privacy Level Controls VISIBILITY of uploaded images:
 * - PUBLIC: Everyone sees user's uploaded avatar/background URL
 * - FRIENDS: Only friends see user's uploaded avatar/background URL
 * - PRIVATE: Only self sees uploaded URL, others see default icon
 *
 * Two Scenarios:
 * 1. User HAS uploaded avatar + privacy = PRIVATE:
 *    - Self: Sees own uploaded avatar
 *    - Others: See default icon (uploaded avatar is hidden)
 *
 * 2. User has NOT uploaded avatar yet:
 *    - Everyone: Sees default icon (no uploaded image exists)
 *    - Privacy setting doesn't matter (nothing to hide)
 *
 * S3 Bucket Security (OAC - Origin Access Control):
 * - ALL files in S3 are PRIVATE (Block All Public Access enabled)
 * - CloudFront is the ONLY way to access files (via signed URLs)
 * - Even if URL is "public" in privacy settings, users still need signed URL to view
 * - Privacy controls URL visibility, S3 OAC controls file access
 *
 * This is like Facebook:
 * - Profile picture privacy = PUBLIC: Everyone sees it exists
 * - Profile picture privacy = PRIVATE: Only you see it, others see default icon
 * - But Facebook always controls access via their CDN (you can't hotlink)
 */

import { UserProfile } from '../models/user.model';
import { PrivacySettings, PrivacyLevel, RelationshipType } from '../models/privacy.model';

/**
 * Default avatar URL for private avatars
 * This is a public default image (not in private S3 bucket)
 */
const DEFAULT_AVATAR_URL = 'https://cdn-dev.everyonecook.cloud/defaults/avatar.png';

/**
 * Default background URL for private backgrounds
 * This is a public default image (not in private S3 bucket)
 */
const DEFAULT_BACKGROUND_URL = 'https://cdn-dev.everyonecook.cloud/defaults/background.png';

/**
 * Filter user profile based on privacy settings and relationship
 *
 * Block Logic:
 * - If relationship is BLOCKED, return minimal info (username only)
 * - Blocked users cannot see any profile details
 *
 * @param profile - User profile
 * @param privacy - Privacy settings
 * @param relationship - Relationship between viewer and profile owner
 * @returns Filtered profile
 */
export function filterProfileByPrivacy(
  profile: UserProfile,
  privacy: PrivacySettings,
  relationship: RelationshipType | string
): Partial<UserProfile> {
  // Normalize relationship to lowercase string for comparison
  const rel = String(relationship).toLowerCase();

  // Self - return full profile
  if (rel === 'self') {
    return profile;
  }

  // BLOCKED - return minimal info only (username)
  // User A blocked User B → B can only see A's username (for context)
  if (rel === 'blocked') {
    return {
      userId: profile.userId,
      username: profile.username,
      // No other fields visible
    };
  }

  // Start with base fields (always visible for non-blocked users)
  const filtered: Partial<UserProfile> = {
    userId: profile.userId,
    username: profile.username,
    isActive: profile.isActive,
    isBanned: profile.isBanned,
    isSuspended: profile.isSuspended,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };

  // Filter fields based on privacy settings
  if (canViewField(privacy.fullName, relationship)) {
    filtered.fullName = profile.fullName;
  }

  if (canViewField(privacy.email, relationship)) {
    filtered.email = profile.email;
  }

  if (canViewField(privacy.birthday, relationship)) {
    filtered.birthday = profile.birthday;
  }

  if (canViewField(privacy.gender, relationship)) {
    filtered.gender = profile.gender;
  }

  if (canViewField(privacy.country, relationship)) {
    filtered.country = profile.country;
  }

  if (canViewField(privacy.bio, relationship)) {
    filtered.bio = profile.bio;
  }

  // Handle avatar URL
  // Privacy controls whether viewer can see user's UPLOADED avatar
  // - If user uploaded avatar + privacy allows → Show uploaded avatar URL
  // - If user uploaded avatar + privacy blocks → Show default icon (hide uploaded avatar)
  // - If user never uploaded avatar → Show default icon (nothing to hide)
  if (canViewField(privacy.avatarUrl, relationship)) {
    filtered.avatarUrl = profile.avatarUrl; // Show user's uploaded avatar (or undefined if not uploaded)
  } else {
    filtered.avatarUrl = DEFAULT_AVATAR_URL; // Hide uploaded avatar, show default icon
  }

  // Handle background URL
  // Same logic as avatar:
  // - Privacy = PUBLIC/FRIENDS → Show uploaded background (if exists)
  // - Privacy = PRIVATE → Show default background (hide uploaded one)
  if (canViewField(privacy.backgroundUrl, relationship)) {
    filtered.backgroundUrl = profile.backgroundUrl; // Show user's uploaded background (or undefined if not uploaded)
  } else {
    filtered.backgroundUrl = DEFAULT_BACKGROUND_URL; // Hide uploaded background, show default
  }

  return filtered;
}

/**
 * Check if viewer can view a field based on privacy level and relationship
 *
 * IMPORTANT: Privacy level from DynamoDB is a string ('public', 'friends', 'private')
 * We compare using string values to ensure compatibility with both enum and string types.
 *
 * @param privacyLevel - Privacy level of the field (string or PrivacyLevel enum)
 * @param relationship - Relationship between viewer and profile owner (string or RelationshipType enum)
 * @returns True if viewer can view the field
 */
function canViewField(
  privacyLevel: PrivacyLevel | string,
  relationship: RelationshipType | string
): boolean {
  // Normalize to lowercase string for comparison
  const level = String(privacyLevel).toLowerCase();
  const rel = String(relationship).toLowerCase();

  switch (level) {
    case 'public':
      return true;

    case 'friends':
      return rel === 'friend';

    case 'private':
      return false;

    default:
      console.warn(`[canViewField] Unknown privacy level: ${privacyLevel}, defaulting to false`);
      return false;
  }
}
