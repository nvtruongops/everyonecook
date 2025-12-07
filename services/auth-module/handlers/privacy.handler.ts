/**
 * Privacy Settings Handlers
 *
 * Implements privacy settings management:
 * - Get privacy settings (own settings)
 * - Update privacy settings (field-level control)
 * - Validate privacy levels
 * - Default privacy configuration
 *
 * @module handlers/privacy
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Privacy Controls
 */

import { PrivacySettings, PrivacyLevel, PrivacyUpdateRequest } from '../models/privacy.model';
import { getPrivacySettings, updatePrivacySettings } from '../services/profile.service';

/**
 * Get own privacy settings handler
 *
 * Returns full privacy settings for authenticated user
 *
 * @param userId - Authenticated user ID from JWT
 * @returns Privacy settings
 */
export async function getOwnPrivacySettings(userId: string): Promise<PrivacySettings> {
  // Get privacy settings
  const privacy = await getPrivacySettings(userId);

  if (!privacy) {
    throw new Error('Privacy settings not found');
  }

  return privacy;
}

/**
 * Update privacy settings handler
 *
 * Updates field-level privacy controls
 *
 * Note: Privacy updates share the same rate limit as profile updates
 * to prevent abuse. This ensures that updating profile + privacy in one
 * Save action counts as a single operation.
 *
 * @param userId - Authenticated user ID from JWT
 * @param updates - Privacy fields to update
 * @returns Updated privacy settings
 */
export async function updateOwnPrivacySettings(
  userId: string,
  updates: PrivacyUpdateRequest
): Promise<PrivacySettings> {
  // Validate privacy levels
  validatePrivacyUpdates(updates);

  // Update privacy settings (no rate limit check here - handled by profile update)
  // Privacy updates are considered part of profile management
  return await updatePrivacySettings(userId, updates);
}

/**
 * Validate privacy update request
 *
 * Ensures all privacy levels are valid and enforces fixed fields
 *
 * Fixed fields (cannot be changed):
 * - fullName: Always PUBLIC (required for search)
 * - savedRecipes: Always PRIVATE (like bookmarks)
 *
 * @param updates - Privacy fields to update
 * @throws Error if invalid privacy level or trying to change fixed fields
 */
function validatePrivacyUpdates(updates: PrivacyUpdateRequest): void {
  const validLevels: PrivacyLevel[] = [
    PrivacyLevel.PUBLIC,
    PrivacyLevel.FRIENDS,
    PrivacyLevel.PRIVATE,
  ];

  const fields = Object.keys(updates) as Array<keyof PrivacyUpdateRequest>;

  for (const field of fields) {
    const level = updates[field];

    if (level && !validLevels.includes(level)) {
      throw new Error(`Invalid privacy level for ${field}: ${level}`);
    }
  }

  // Note: fullName and savedRecipes validation is handled in profile.service.ts
  // This handler just validates the privacy levels themselves
}
