'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserNutritionGoals, 
  NutritionGoalProgress,
  calculateNutritionProgress,
  getProgressColor,
  getProgressBgColor
} from '@/types/nutrition';
import { nutritionGoalsService } from '@/services/nutritionGoalsService';
import { useAuth } from '@/contexts/AuthContext';

interface NutritionProgressTrackerProps {
  date?: string; // YYYY-MM-DD format, defaults to today
  goals?: UserNutritionGoals | null;
  onAddRecipe?: () => void;
}

interface ProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  color?: string;
}

function ProgressBar({ label, current, target, unit, color }: ProgressBarProps) {
  const progress = calculateNutritionProgress(current, target);
  const progressColor = color || getProgressColor(progress);
  const bgColor = getProgressBgColor(progress);
  
  const barWidth = Math.min(progress, 100);
  const isOver = progress > 100;

  return (
    <div className={`p-4 rounded-lg ${bgColor}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium text-gray-900">{label}</span>
        <span className={`text-sm font-semibold ${progressColor}`}>
          {progress}%
        </span>
      </div>
      
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-600">
          {current.toFixed(1)} / {target} {unit}
        </span>
        {isOver && (
          <span className="text-xs text-red-600 font-medium">
            +{(current - target).toFixed(1)} over
          </span>
        )}
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            isOver ? 'bg-red-500' : 'bg-green-500'
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

export default function NutritionProgressTracker({ 
  date, 
  goals,
  onAddRecipe 
}: NutritionProgressTrackerProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<NutritionGoalProgress | null>(null);
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (user && goals) {
      loadProgress();
    }
  }, [user, goals, selectedDate]);

  const loadProgress = async () => {
    if (!user || !goals) return;

    setLoading(true);
    setError(null);

    try {
      const progressData = await nutritionGoalsService.getNutritionProgress(user.sub, selectedDate);
      
      if (!progressData) {
        // Create empty progress for the day
        const emptyProgress: NutritionGoalProgress = {
          date: selectedDate,
          userId: user.sub,
          caloriesConsumed: 0,
          proteinConsumed: 0,
          carbsConsumed: 0,
          fatConsumed: 0,
          fiberConsumed: 0,
          sodiumConsumed: 0,
          caloriesProgress: 0,
          proteinProgress: 0,
          carbsProgress: 0,
          fatProgress: 0,
          fiberProgress: 0,
          sodiumProgress: 0,
          recipeContributions: [],
          updatedAt: new Date()
        };
        setProgress(emptyProgress);
      } else {
        setProgress(progressData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load nutrition progress');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please sign in to track nutrition progress</p>
      </div>
    );
  }

  if (!goals) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600 mb-4">Set up your nutrition goals to start tracking progress</p>
        <button
          onClick={() => window.location.href = '/nutrition/goals'}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Set Up Goals
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadProgress}
            className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nutrition Progress</h2>
          <p className="text-gray-600">{formatDate(selectedDate)}</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          {onAddRecipe && (
            <button
              onClick={onAddRecipe}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Add Recipe
            </button>
          )}
        </div>
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <ProgressBar
          label="Calories"
          current={progress?.caloriesConsumed || 0}
          target={goals.dailyCaloriesTarget}
          unit="kcal"
        />
        
        <ProgressBar
          label="Protein"
          current={progress?.proteinConsumed || 0}
          target={goals.proteinTargetG}
          unit="g"
        />
        
        <ProgressBar
          label="Carbohydrates"
          current={progress?.carbsConsumed || 0}
          target={goals.carbsTargetG}
          unit="g"
        />
        
        <ProgressBar
          label="Fat"
          current={progress?.fatConsumed || 0}
          target={goals.fatTargetG}
          unit="g"
        />
        
        <ProgressBar
          label="Fiber"
          current={progress?.fiberConsumed || 0}
          target={goals.fiberTargetG}
          unit="g"
        />
        
        <ProgressBar
          label="Sodium"
          current={progress?.sodiumConsumed || 0}
          target={goals.sodiumTargetMg}
          unit="mg"
        />
      </div>

      {/* Recipe Contributions */}
      {progress?.recipeContributions && progress.recipeContributions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Recipes</h3>
          <div className="space-y-3">
            {progress.recipeContributions.map((contribution, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">{contribution.recipeName}</h4>
                  <p className="text-sm text-gray-600">
                    {contribution.servingsConsumed} serving{contribution.servingsConsumed !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {contribution.nutritionContribution.caloriesPerServing || 0} cal
                  </p>
                  <p className="text-xs text-gray-600">
                    {new Date(contribution.timestamp).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!progress?.recipeContributions || progress.recipeContributions.length === 0) && (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">No recipes logged for {formatDate(selectedDate)}</p>
          {onAddRecipe && (
            <button
              onClick={onAddRecipe}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Log Your First Recipe
            </button>
          )}
        </div>
      )}
    </div>
  );
}
