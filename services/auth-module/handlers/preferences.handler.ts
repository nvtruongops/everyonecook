/**
 * Preferences Handlers
 *
 * Implements user cooking preferences operations:
 * - Get stable preferences (long-term)
 * - Get frequent preferences (context-specific)
 * - Update stable preferences
 * - Update frequent preferences
 *
 * @module handlers/preferences
 */

import {
  getStablePreferences,
  getFrequentPreferences,
  createDefaultStablePreferences,
  createDefaultFrequentPreferences,
  updateStablePreferences,
  updateFrequentPreferences,
} from '../services/preferences.service';
import {
  StablePreferences,
  FrequentPreferences,
  UpdateStablePreferencesRequest,
  UpdateFrequentPreferencesRequest,
} from '../models/preferences.model';

/**
 * Get stable preferences handler
 *
 * Returns long-term cooking preferences
 * Auto-creates default preferences if not found
 *
 * @param userId - Authenticated user ID from JWT
 * @returns Stable preferences
 */
export async function getStablePreferencesHandler(userId: string): Promise<StablePreferences> {
  let preferences = await getStablePreferences(userId);

  // Auto-create if not found
  if (!preferences) {
    console.log('[getStablePreferencesHandler] Creating default stable preferences for:', userId);
    preferences = await createDefaultStablePreferences(userId);
  }

  return preferences;
}

/**
 * Get frequent preferences handler
 *
 * Returns context-specific cooking preferences
 * Auto-creates default preferences if not found
 *
 * @param userId - Authenticated user ID from JWT
 * @returns Frequent preferences
 */
export async function getFrequentPreferencesHandler(userId: string): Promise<FrequentPreferences> {
  let preferences = await getFrequentPreferences(userId);

  // Auto-create if not found
  if (!preferences) {
    console.log(
      '[getFrequentPreferencesHandler] Creating default frequent preferences for:',
      userId
    );
    preferences = await createDefaultFrequentPreferences(userId);
  }

  return preferences;
}

/**
 * Update stable preferences handler
 *
 * Updates long-term cooking preferences
 *
 * @param userId - Authenticated user ID from JWT
 * @param updates - Preferences to update
 * @returns Updated stable preferences
 */
export async function updateStablePreferencesHandler(
  userId: string,
  updates: UpdateStablePreferencesRequest
): Promise<StablePreferences> {
  // Ensure preferences exist
  let existing = await getStablePreferences(userId);
  if (!existing) {
    console.log(
      '[updateStablePreferencesHandler] Creating default stable preferences for:',
      userId
    );
    existing = await createDefaultStablePreferences(userId);
  }

  // Update preferences
  return await updateStablePreferences(userId, updates);
}

/**
 * Update frequent preferences handler
 *
 * Updates context-specific cooking preferences
 *
 * @param userId - Authenticated user ID from JWT
 * @param updates - Preferences to update
 * @returns Updated frequent preferences
 */
export async function updateFrequentPreferencesHandler(
  userId: string,
  updates: UpdateFrequentPreferencesRequest
): Promise<FrequentPreferences> {
  // Ensure preferences exist
  let existing = await getFrequentPreferences(userId);
  if (!existing) {
    console.log(
      '[updateFrequentPreferencesHandler] Creating default frequent preferences for:',
      userId
    );
    existing = await createDefaultFrequentPreferences(userId);
  }

  // Update preferences
  return await updateFrequentPreferences(userId, updates);
}
