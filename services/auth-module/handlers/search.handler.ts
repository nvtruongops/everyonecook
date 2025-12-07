/**
 * User Search Handler
 *
 * Implements user search functionality:
 * - Search users by username (partial match)
 * - Apply privacy filtering based on relationship
 * - Include friendship status for each user
 * - Pagination support
 *
 * @module handlers/search
 * @see .kiro/specs/project-restructure/user-profile-requirements.md - User Search
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Privacy Filtering
 */

import { UserProfile } from '../models/user.model';
import { RelationshipType } from '../models/privacy.model';
import { searchUsersByUsername } from '../services/search.service';
import { filterProfileByPrivacy } from '../services/privacy-filter.service';
import { getPrivacySettings, determineRelationship } from '../services/profile.service';
import { sanitizeInput } from '../utils/validation';
import { getFriendshipStatus, FriendshipStatusType } from '../services/friendship.service';

// Extended user profile with friendship info
interface SearchResultUser extends Partial<UserProfile> {
  friendshipStatus: FriendshipStatusType;
  isFriend: boolean;
  isPendingSent: boolean;
  isPendingReceived: boolean;
}

/**
 * Search users handler
 *
 * Searches users by username with privacy filtering
 *
 * @param query - Search query (username partial match)
 * @param viewerId - Viewer user ID (null for anonymous)
 * @param limit - Max results per page (default 20)
 * @param nextToken - Pagination token
 * @returns Filtered user profiles and pagination token
 */
export async function searchUsers(
  query: string,
  viewerId: string | null,
  limit: number = 20,
  nextToken?: string
): Promise<{ users: SearchResultUser[]; nextToken?: string }> {
  // Validate and sanitize query
  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required');
  }

  const sanitizedQuery = sanitizeInput(query.trim());

  // Validate query length
  if (sanitizedQuery.length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  if (sanitizedQuery.length > 30) {
    throw new Error('Search query must be at most 30 characters');
  }

  // Validate limit
  if (limit < 1 || limit > 50) {
    throw new Error('Limit must be between 1 and 50');
  }

  // Search users by username
  const searchResult = await searchUsersByUsername(sanitizedQuery, limit, nextToken);

  // Filter profiles based on privacy settings and block status
  const filteredUsers = await Promise.all(
    searchResult.users.map(async (user: UserProfile) => {
      // Exclude current user from search results
      if (viewerId && user.userId === viewerId) {
        return null;
      }

      // Get privacy settings
      const privacy = await getPrivacySettings(user.userId);
      if (!privacy) {
        // If no privacy settings, skip user
        return null;
      }

      // Determine relationship (includes block check)
      const relationship = await determineRelationship(user.userId, viewerId);

      // If user blocked viewer, exclude from search results
      // Block Logic: A blocks B → B cannot find A in search
      if (relationship === RelationshipType.BLOCKED) {
        return null;
      }

      // Filter profile based on privacy and relationship
      const filteredProfile = filterProfileByPrivacy(user, privacy, relationship);

      // Get friendship status
      const friendshipStatus = await getFriendshipStatus(viewerId, user.userId);

      // Add friendship info to profile
      return {
        ...filteredProfile,
        friendshipStatus,
        isFriend: friendshipStatus === 'friends',
        isPendingSent: friendshipStatus === 'pending_sent',
        isPendingReceived: friendshipStatus === 'pending_received',
      };
    })
  );

  // Remove null entries (users without privacy settings or blocked users)
  const validUsers = filteredUsers.filter((user): user is SearchResultUser => user !== null);

  return {
    users: validUsers,
    nextToken: searchResult.nextToken,
  };
}
