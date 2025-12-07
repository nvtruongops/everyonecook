'use client';

import React, { useState, useEffect } from 'react';
import { UserNutritionGoals, createDefaultNutritionGoals } from '@/types/nutrition';
import { useAuth } from '@/contexts/AuthContext';

// Local type definitions
type Gender = 'male' | 'female' | 'other';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

interface NutritionGoalCalculationParams {
  age: number;
  gender: Gender;
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  healthGoals?: string[];
}

// Simple calculation service (inline for now)
const nutritionGoalsService = {
  calculateRecommendedTargets: (params: NutritionGoalCalculationParams) => {
    // Harris-Benedict equation for BMR
    let bmr: number;
    if (params.gender === 'male') {
      bmr = 88.362 + 13.397 * params.weightKg + 4.799 * params.heightCm - 5.677 * params.age;
    } else {
      bmr = 447.593 + 9.247 * params.weightKg + 3.098 * params.heightCm - 4.33 * params.age;
    }

    // Activity multiplier
    const multipliers: Record<ActivityLevel, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };

    const dailyCalories = Math.round(bmr * multipliers[params.activityLevel]);

    return {
      dailyCalories,
      proteinG: Math.round((dailyCalories * 0.25) / 4),
      carbsG: Math.round((dailyCalories * 0.45) / 4),
      fatG: Math.round((dailyCalories * 0.3) / 9),
      fiberG: 25,
      sodiumMg: 2300,
    };
  },
  saveUserGoals: async (goals: any) => {
    // TODO: Implement API call
    console.log('Saving goals:', goals);
    return goals;
  },
};

interface NutritionGoalsSetupProps {
  onSave?: (goals: UserNutritionGoals) => void;
  onCancel?: () => void;
  existingGoals?: UserNutritionGoals | null;
}

const HEALTH_GOALS_OPTIONS = [
  'Weight Loss',
  'Weight Gain',
  'Muscle Building',
  'Maintain Weight',
  'Improve Energy',
  'Better Sleep',
  'Heart Health',
  'Diabetes Management',
  'Lower Cholesterol',
  'Digestive Health',
];

const DIETARY_RESTRICTIONS_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Nut-Free',
  'Low-Sodium',
  'Low-Carb',
  'Keto',
  'Paleo',
  'Mediterranean',
];

export default function NutritionGoalsSetup({
  onSave,
  onCancel,
  existingGoals,
}: NutritionGoalsSetupProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<Partial<UserNutritionGoals>>(() => {
    if (existingGoals) {
      return existingGoals;
    }
    return user ? createDefaultNutritionGoals(user.sub) : {};
  });

  const [calculatedTargets, setCalculatedTargets] = useState<any>(null);

  // Calculate recommended targets when basic info changes
  useEffect(() => {
    if (goals.age && goals.gender && goals.weightKg && goals.heightCm && goals.activityLevel) {
      const params: NutritionGoalCalculationParams = {
        age: goals.age,
        gender: goals.gender,
        weightKg: goals.weightKg,
        heightCm: goals.heightCm,
        activityLevel: goals.activityLevel,
        healthGoals: goals.healthGoals,
      };

      const targets = nutritionGoalsService.calculateRecommendedTargets(params);
      setCalculatedTargets(targets);

      // Auto-update targets if auto-calculate is enabled
      if (goals.autoCalculateTargets) {
        setGoals((prev) => ({
          ...prev,
          dailyCaloriesTarget: targets.dailyCalories,
          proteinTargetG: targets.proteinG,
          carbsTargetG: targets.carbsG,
          fatTargetG: targets.fatG,
          fiberTargetG: targets.fiberG,
          sodiumTargetMg: targets.sodiumMg,
          macroDistribution: {
            proteinPercent: Math.round(((targets.proteinG * 4) / targets.dailyCalories) * 100),
            carbsPercent: Math.round(((targets.carbsG * 4) / targets.dailyCalories) * 100),
            fatPercent: Math.round(((targets.fatG * 9) / targets.dailyCalories) * 100),
          },
        }));
      }
    }
  }, [
    goals.age,
    goals.gender,
    goals.weightKg,
    goals.heightCm,
    goals.activityLevel,
    goals.autoCalculateTargets,
    goals.healthGoals,
  ]);

  const handleInputChange = (field: keyof UserNutritionGoals, value: any) => {
    setGoals((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleArrayToggle = (field: 'healthGoals' | 'dietaryRestrictions', value: string) => {
    setGoals((prev) => {
      const currentArray = prev[field] || [];
      const newArray = currentArray.includes(value)
        ? currentArray.filter((item) => item !== value)
        : [...currentArray, value];

      return {
        ...prev,
        [field]: newArray,
      };
    });
  };

  const handleMacroDistributionChange = (
    macro: 'proteinPercent' | 'carbsPercent' | 'fatPercent',
    value: number
  ) => {
    setGoals((prev) => ({
      ...prev,
      macroDistribution: {
        ...prev.macroDistribution!,
        [macro]: value,
      },
    }));
  };

  const handleUseRecommended = () => {
    if (calculatedTargets) {
      setGoals((prev) => ({
        ...prev,
        dailyCaloriesTarget: calculatedTargets.dailyCalories,
        proteinTargetG: calculatedTargets.proteinG,
        carbsTargetG: calculatedTargets.carbsG,
        fatTargetG: calculatedTargets.fatG,
        fiberTargetG: calculatedTargets.fiberG,
        sodiumTargetMg: calculatedTargets.sodiumMg,
        macroDistribution: {
          proteinPercent: Math.round(
            ((calculatedTargets.proteinG * 4) / calculatedTargets.dailyCalories) * 100
          ),
          carbsPercent: Math.round(
            ((calculatedTargets.carbsG * 4) / calculatedTargets.dailyCalories) * 100
          ),
          fatPercent: Math.round(
            ((calculatedTargets.fatG * 9) / calculatedTargets.dailyCalories) * 100
          ),
        },
      }));
    }
  };

  const handleSave = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    // Validation
    if (!goals.age || !goals.gender || !goals.weightKg || !goals.heightCm || !goals.activityLevel) {
      setError('Please fill in all basic information fields');
      return;
    }

    if (
      !goals.dailyCaloriesTarget ||
      !goals.proteinTargetG ||
      !goals.carbsTargetG ||
      !goals.fatTargetG
    ) {
      setError('Please set all nutrition targets');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const savedGoals = await nutritionGoalsService.saveUserGoals({
        ...goals,
        userId: user.sub,
      });

      onSave?.(savedGoals);
    } catch (err: any) {
      setError(err.message || 'Failed to save nutrition goals');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please sign in to set up nutrition goals</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {existingGoals ? 'Update Nutrition Goals' : 'Set Up Nutrition Goals'}
        </h2>
        <p className="text-gray-600">
          Configure your personal nutrition targets and preferences to get personalized
          recommendations.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-8">
        {/* Basic Information */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">
                Age
              </label>
              <input
                id="age"
                type="number"
                min="18"
                max="100"
                value={goals.age || ''}
                onChange={(e) => handleInputChange('age', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="30"
              />
            </div>

            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                Gender
              </label>
              <select
                id="gender"
                value={goals.gender || ''}
                onChange={(e) => handleInputChange('gender', e.target.value as Gender)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">
                Weight (kg)
              </label>
              <input
                id="weight"
                type="number"
                min="30"
                max="300"
                step="0.1"
                value={goals.weightKg || ''}
                onChange={(e) => handleInputChange('weightKg', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="70"
              />
            </div>

            <div>
              <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-1">
                Height (cm)
              </label>
              <input
                id="height"
                type="number"
                min="100"
                max="250"
                value={goals.heightCm || ''}
                onChange={(e) => handleInputChange('heightCm', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="170"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="activityLevel" className="block text-sm font-medium text-gray-700 mb-1">
              Activity Level
            </label>
            <select
              id="activityLevel"
              value={goals.activityLevel || ''}
              onChange={(e) => handleInputChange('activityLevel', e.target.value as ActivityLevel)}
              className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select activity level</option>
              <option value="sedentary">Sedentary (little/no exercise)</option>
              <option value="light">Light (light exercise 1-3 days/week)</option>
              <option value="moderate">Moderate (moderate exercise 3-5 days/week)</option>
              <option value="active">Active (hard exercise 6-7 days/week)</option>
              <option value="very_active">Very Active (very hard exercise, physical job)</option>
            </select>
          </div>
        </div>

        {/* Nutrition Targets */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Nutrition Targets</h3>

            <div className="flex items-center space-x-4">
              <label htmlFor="autoCalculate" className="flex items-center">
                <input
                  id="autoCalculate"
                  type="checkbox"
                  checked={goals.autoCalculateTargets || false}
                  onChange={(e) => handleInputChange('autoCalculateTargets', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Auto-calculate targets</span>
              </label>

              {calculatedTargets && !goals.autoCalculateTargets && (
                <button
                  type="button"
                  onClick={handleUseRecommended}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                >
                  Use Recommended
                </button>
              )}
            </div>
          </div>

          {calculatedTargets && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700 mb-2">
                <strong>Recommended targets based on your profile:</strong>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                <div>
                  Calories: <strong>{calculatedTargets.dailyCalories}</strong>
                </div>
                <div>
                  Protein: <strong>{calculatedTargets.proteinG}g</strong>
                </div>
                <div>
                  Carbs: <strong>{calculatedTargets.carbsG}g</strong>
                </div>
                <div>
                  Fat: <strong>{calculatedTargets.fatG}g</strong>
                </div>
                <div>
                  Fiber: <strong>{calculatedTargets.fiberG}g</strong>
                </div>
                <div>
                  Sodium: <strong>{calculatedTargets.sodiumMg}mg</strong>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="dailyCalories"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Daily Calories
              </label>
              <input
                id="dailyCalories"
                type="number"
                min="1000"
                max="5000"
                value={goals.dailyCaloriesTarget || ''}
                onChange={(e) =>
                  handleInputChange('dailyCaloriesTarget', parseInt(e.target.value) || 0)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="2000"
                disabled={goals.autoCalculateTargets}
              />
            </div>

            <div>
              <label htmlFor="protein" className="block text-sm font-medium text-gray-700 mb-1">
                Protein (g)
              </label>
              <input
                id="protein"
                type="number"
                min="50"
                max="300"
                value={goals.proteinTargetG || ''}
                onChange={(e) => handleInputChange('proteinTargetG', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="125"
                disabled={goals.autoCalculateTargets}
              />
            </div>

            <div>
              <label htmlFor="carbs" className="block text-sm font-medium text-gray-700 mb-1">
                Carbohydrates (g)
              </label>
              <input
                id="carbs"
                type="number"
                min="50"
                max="500"
                value={goals.carbsTargetG || ''}
                onChange={(e) => handleInputChange('carbsTargetG', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="225"
                disabled={goals.autoCalculateTargets}
              />
            </div>

            <div>
              <label htmlFor="fat" className="block text-sm font-medium text-gray-700 mb-1">
                Fat (g)
              </label>
              <input
                id="fat"
                type="number"
                min="20"
                max="200"
                value={goals.fatTargetG || ''}
                onChange={(e) => handleInputChange('fatTargetG', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="67"
                disabled={goals.autoCalculateTargets}
              />
            </div>

            <div>
              <label htmlFor="fiber" className="block text-sm font-medium text-gray-700 mb-1">
                Fiber (g)
              </label>
              <input
                id="fiber"
                type="number"
                min="10"
                max="60"
                value={goals.fiberTargetG || ''}
                onChange={(e) => handleInputChange('fiberTargetG', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="25"
                disabled={goals.autoCalculateTargets}
              />
            </div>

            <div>
              <label htmlFor="sodium" className="block text-sm font-medium text-gray-700 mb-1">
                Sodium (mg)
              </label>
              <input
                id="sodium"
                type="number"
                min="1000"
                max="5000"
                value={goals.sodiumTargetMg || ''}
                onChange={(e) => handleInputChange('sodiumTargetMg', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="2300"
                disabled={goals.autoCalculateTargets}
              />
            </div>
          </div>
        </div>

        {/* Health Goals */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Health Goals</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {HEALTH_GOALS_OPTIONS.map((goal) => (
              <label key={goal} className="flex items-center">
                <input
                  type="checkbox"
                  checked={goals.healthGoals?.includes(goal) || false}
                  onChange={() => handleArrayToggle('healthGoals', goal)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">{goal}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Dietary Restrictions */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Dietary Restrictions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {DIETARY_RESTRICTIONS_OPTIONS.map((restriction) => (
              <label key={restriction} className="flex items-center">
                <input
                  type="checkbox"
                  checked={goals.dietaryRestrictions?.includes(restriction) || false}
                  onChange={() => handleArrayToggle('dietaryRestrictions', restriction)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">{restriction}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex justify-end space-x-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : existingGoals ? 'Update Goals' : 'Save Goals'}
        </button>
      </div>
    </div>
  );
}
