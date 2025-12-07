/**
 * useFeatureFlags Hook
 * Access feature flags in components
 */

import { featureFlags, isFeatureEnabled } from '@/lib/featureFlags';

export function useFeatureFlags() {
  return {
    flags: featureFlags,
    isEnabled: isFeatureEnabled,
  };
}

