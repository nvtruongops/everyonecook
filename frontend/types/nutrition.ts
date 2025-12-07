/**
 * Nutrition Types
 */

export interface NutritionProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface UserNutritionGoals {
  dailyCalories: number;
  dailyCaloriesTarget?: number; // Alias
  protein: number;
  proteinTargetG?: number; // Alias
  carbs: number;
  carbsTargetG?: number; // Alias
  fat: number;
  fatTargetG?: number; // Alias
  fiber?: number;
  fiberTargetG?: number; // Alias
  sodiumTargetMg?: number;
  healthGoals?: string[];
  dietaryRestrictions?: string[];
}

export interface NutritionGoalProgress {
  goal: UserNutritionGoals;
  current: NutritionProfile;
  percentage: number;
  date?: string; // Date tracking for progress
}

export interface NutritionRecommendation {
  recipe: Recipe;
  nutritionProfile: NutritionProfile;
  score: number;
  reasoning: string[];
  benefits: string[];
  goalContribution?: any;
}

export interface UserNutritionPattern {
  preferredCuisines: string[];
  preferredMealTypes: string[];
  commonIngredients: string[];
}

export interface RecommendationSchedule {
  userId: string;
  frequency: 'daily' | 'weekly' | 'custom';
  dayOfWeek?: number;
  timeOfDay?: string;
  lastRun?: Date;
  nextRun?: Date;
  isActive: boolean;
}

export interface RecommendationPerformanceMetrics {
  totalRecommendations: number;
  acceptedRecommendations: number;
  viewRate: number;
  saveRate: number;
  likeRate: number;
  improvementSuggestions: string[];
}

export interface Recipe {
  recipe_id: string;
  title: string;
  ingredients: any[];
  cuisine_type: string;
  meal_type: string;
}

// Helper functions
export function formatNutritionValue(value: number, unit: string = 'g'): string {
  return `${Math.round(value)}${unit}`;
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600';
  if (confidence >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.6) return 'Medium';
  return 'Low';
}

export function calculateNutritionProgress(
  current: NutritionProfile,
  goal: UserNutritionGoals
): number {
  const calorieProgress = (current.calories / goal.dailyCalories) * 100;
  return Math.min(calorieProgress, 100);
}

export function getProgressColor(percentage: number): string {
  if (percentage < 50) return 'text-red-600';
  if (percentage < 80) return 'text-yellow-600';
  if (percentage <= 100) return 'text-green-600';
  return 'text-orange-600';
}

// Nutrition ranges for validation
export const NUTRITION_RANGES = {
  calories: { min: 0, max: 5000 },
  protein: { min: 0, max: 500 },
  carbs: { min: 0, max: 500 },
  fat: { min: 0, max: 200 },
  fiber: { min: 0, max: 100 },
  sugar: { min: 0, max: 200 },
  sodium: { min: 0, max: 10000 },
};

export function validateNutritionValue(key: keyof typeof NUTRITION_RANGES, value: number): boolean {
  const range = NUTRITION_RANGES[key];
  return value >= range.min && value <= range.max;
}

export function createEmptyNutritionProfile(): NutritionProfile {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
  };
}

// Nutrition Options
export type NutritionOption = 'none' | 'basic' | 'detailed';

// Gender types
export type Gender = 'male' | 'female' | 'other';

// Activity Level types
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

// Create default nutrition goals
export function createDefaultNutritionGoals(
  gender: Gender = 'male',
  activityLevel: ActivityLevel = 'moderate'
): UserNutritionGoals {
  // Base calorie calculation
  let baseCalories = 2000;

  if (gender === 'male') {
    baseCalories = 2500;
  } else if (gender === 'female') {
    baseCalories = 2000;
  }

  // Adjust for activity level
  const activityMultiplier = {
    sedentary: 1.0,
    light: 1.2,
    moderate: 1.4,
    active: 1.6,
    very_active: 1.8,
  };

  const dailyCalories = Math.round(baseCalories * activityMultiplier[activityLevel]);

  return {
    dailyCalories,
    dailyCaloriesTarget: dailyCalories,
    protein: Math.round((dailyCalories * 0.3) / 4), // 30% of calories, 4 cal/g
    proteinTargetG: Math.round((dailyCalories * 0.3) / 4),
    carbs: Math.round((dailyCalories * 0.4) / 4), // 40% of calories, 4 cal/g
    carbsTargetG: Math.round((dailyCalories * 0.4) / 4),
    fat: Math.round((dailyCalories * 0.3) / 9), // 30% of calories, 9 cal/g
    fatTargetG: Math.round((dailyCalories * 0.3) / 9),
    fiber: 25,
    fiberTargetG: 25,
    sodiumTargetMg: 2300,
    healthGoals: [],
    dietaryRestrictions: [],
  };
}

// Get progress background color
export function getProgressBgColor(percentage: number): string {
  if (percentage < 50) return 'bg-red-100';
  if (percentage < 80) return 'bg-yellow-100';
  if (percentage <= 100) return 'bg-green-100';
  return 'bg-orange-100';
}

// Additional types for API routes
export interface IngredientLookupRequest {
  ingredient: string;
  language?: string;
}

export interface IngredientLookupResponse {
  ingredient: string;
  translation: string;
  nutrition?: NutritionProfile;
}

export interface NutritionValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateNutritionProfile(
  profile: Partial<NutritionProfile>
): NutritionValidationResult {
  const errors: string[] = [];

  if (profile.calories !== undefined && (profile.calories < 0 || profile.calories > 5000)) {
    errors.push('Calories must be between 0 and 5000');
  }

  if (profile.protein !== undefined && (profile.protein < 0 || profile.protein > 500)) {
    errors.push('Protein must be between 0 and 500g');
  }

  if (profile.carbs !== undefined && (profile.carbs < 0 || profile.carbs > 500)) {
    errors.push('Carbs must be between 0 and 500g');
  }

  if (profile.fat !== undefined && (profile.fat < 0 || profile.fat > 200)) {
    errors.push('Fat must be between 0 and 200g');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

