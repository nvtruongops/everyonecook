/**
 * Nutrition Goals Page
 * Allows users to set and manage their nutrition goals
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import NutritionGoalsSetup from '@/components/nutrition/NutritionGoalsSetup';
import { UserNutritionGoals } from '@/types/nutrition';
import { nutritionGoalsService } from '@/services/nutritionGoalsService';

export default function NutritionGoalsPage() {
  const { user } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const [goals, setGoals] = useState<UserNutritionGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isEnabled('nutritionGoals')) {
      loadNutritionGoals();
    }
  }, [user, isEnabled]);

  const loadNutritionGoals = async () => {
    try {
      setLoading(true);
      const userGoals = await nutritionGoalsService.getNutritionGoals(user!.id);
      setGoals(userGoals);
    } catch (err) {
      console.error('Failed to load nutrition goals:', err);
      setError('Failed to load nutrition goals');
    } finally {
      setLoading(false);
    }
  };

  const handleGoalsSave = async (updatedGoals: UserNutritionGoals) => {
    try {
      const savedGoals = await nutritionGoalsService.saveNutritionGoals(updatedGoals);
      setGoals(savedGoals);
      setError(null);
    } catch (err) {
      console.error('Failed to save nutrition goals:', err);
      setError('Failed to save nutrition goals');
    }
  };

  if (!isEnabled('nutritionGoals')) {
    return (
      <div className="text-center py-12">
        <div className="max-w-md mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 rounded-full">
              <svg
                className="w-6 h-6 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-yellow-800 mb-2">Feature Not Available</h3>
            <p className="text-yellow-700">
              Nutrition goals feature is currently disabled. Please contact support if you need
              access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nutrition Goals</h1>
            <p className="text-gray-600 mt-1">
              Set your daily nutrition targets and track your progress towards healthier eating
              habits.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg
              className="w-5 h-5 text-red-400 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Goals Setup Component */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <NutritionGoalsSetup userId={user!.id} existingGoals={goals} onSave={handleGoalsSave} />
      </div>

      {/* Quick Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">💡 Quick Tips</h3>
        <ul className="space-y-2 text-blue-800">
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
            <span>Set realistic goals based on your activity level and health objectives</span>
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
            <span>
              Enable auto-calculation to get personalized recommendations based on your profile
            </span>
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-3 flex-shrink-0"></span>
            <span>
              Review and adjust your goals monthly as your fitness and health needs change
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

