/**
 * Feature Flags
 * Control feature availability
 */

export const featureFlags = {
  nutritionRecommendations: true,
  nutritionTracker: true,
  aiSuggestions: true,
  recipeGroups: true,
  socialFeatures: true,
  adminPanel: false,
};

export const isFeatureEnabled = (feature: keyof typeof featureFlags): boolean => {
  return featureFlags[feature] ?? false;
};

