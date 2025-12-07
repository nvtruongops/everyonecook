'use client';

import React, { useState } from 'react';
import { UserNutritionGoals } from '@/types/nutrition';

interface GoalBasedRecipeFilterProps {
  goals?: UserNutritionGoals | null;
  onFilterChange: (filters: GoalBasedFilters) => void;
  currentFilters?: GoalBasedFilters;
}

export interface GoalBasedFilters {
  alignWithGoals: boolean;
  maxCaloriesPercent: number; // Max percentage of daily calories
  minProteinPercent: number; // Min percentage of daily protein
  maxSodiumPercent: number; // Max percentage of daily sodium
  healthGoals: string[];
  dietaryRestrictions: string[];
  macroBalance: 'any' | 'high-protein' | 'low-carb' | 'balanced';
  mealType: 'any' | 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

const DEFAULT_FILTERS: GoalBasedFilters = {
  alignWithGoals: false,
  maxCaloriesPercent: 50, // Max 50% of daily calories per recipe
  minProteinPercent: 10, // Min 10% of daily protein per recipe
  maxSodiumPercent: 30, // Max 30% of daily sodium per recipe
  healthGoals: [],
  dietaryRestrictions: [],
  macroBalance: 'any',
  mealType: 'any'
};

const MACRO_BALANCE_OPTIONS = [
  { value: 'any', label: 'Any Balance' },
  { value: 'high-protein', label: 'High Protein (>30%)' },
  { value: 'low-carb', label: 'Low Carb (<20%)' },
  { value: 'balanced', label: 'Balanced Macros' }
];

const MEAL_TYPE_OPTIONS = [
  { value: 'any', label: 'Any Meal' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' }
];

export default function GoalBasedRecipeFilter({ 
  goals, 
  onFilterChange, 
  currentFilters = DEFAULT_FILTERS 
}: GoalBasedRecipeFilterProps) {
  const [filters, setFilters] = useState<GoalBasedFilters>(currentFilters);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = (newFilters: Partial<GoalBasedFilters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFilterChange(updatedFilters);
  };

  const handleArrayToggle = (field: 'healthGoals' | 'dietaryRestrictions', value: string) => {
    const currentArray = filters[field];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    
    handleFilterChange({ [field]: newArray });
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    onFilterChange(DEFAULT_FILTERS);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.alignWithGoals) count++;
    if (filters.maxCaloriesPercent !== 50) count++;
    if (filters.minProteinPercent !== 10) count++;
    if (filters.maxSodiumPercent !== 30) count++;
    if (filters.healthGoals.length > 0) count++;
    if (filters.dietaryRestrictions.length > 0) count++;
    if (filters.macroBalance !== 'any') count++;
    if (filters.mealType !== 'any') count++;
    return count;
  };

  if (!goals) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="text-center">
          <p className="text-gray-600 mb-2">Set up nutrition goals to enable goal-based filtering</p>
          <button
            onClick={() => window.location.href = '/nutrition/goals'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Set Up Goals
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-gray-900">Goal-Based Filters</h3>
          {getActiveFilterCount() > 0 && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
              {getActiveFilterCount()} active
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {getActiveFilterCount() > 0 && (
            <button
              onClick={resetFilters}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={filters.alignWithGoals}
              onChange={(e) => handleFilterChange({ alignWithGoals: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Align with my goals</span>
          </label>
          
          <select
            value={filters.macroBalance}
            onChange={(e) => handleFilterChange({ macroBalance: e.target.value as any })}
            className="px-3 py-1 text-sm border border-gray-300 rounded"
          >
            {MACRO_BALANCE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          <select
            value={filters.mealType}
            onChange={(e) => handleFilterChange({ mealType: e.target.value as any })}
            className="px-3 py-1 text-sm border border-gray-300 rounded"
          >
            {MEAL_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 space-y-6">
          {/* Nutrition Limits */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Nutrition Limits (% of daily goals)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Max Calories: {filters.maxCaloriesPercent}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={filters.maxCaloriesPercent}
                  onChange={(e) => handleFilterChange({ maxCaloriesPercent: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Max {Math.round(goals.dailyCaloriesTarget * filters.maxCaloriesPercent / 100)} kcal
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Min Protein: {filters.minProteinPercent}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={filters.minProteinPercent}
                  onChange={(e) => handleFilterChange({ minProteinPercent: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Min {Math.round(goals.proteinTargetG * filters.minProteinPercent / 100)}g protein
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Max Sodium: {filters.maxSodiumPercent}%
                </label>
                <input
                  type="range"
                  min="5"
                  max="80"
                  value={filters.maxSodiumPercent}
                  onChange={(e) => handleFilterChange({ maxSodiumPercent: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Max {Math.round(goals.sodiumTargetMg * filters.maxSodiumPercent / 100)}mg sodium
                </div>
              </div>
            </div>
          </div>

          {/* Health Goals */}
          {goals.healthGoals && goals.healthGoals.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Match Health Goals</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {goals.healthGoals.map((goal) => (
                  <label key={goal} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.healthGoals.includes(goal)}
                      onChange={() => handleArrayToggle('healthGoals', goal)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">{goal}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Dietary Restrictions */}
          {goals.dietaryRestrictions && goals.dietaryRestrictions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Respect Dietary Restrictions</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {goals.dietaryRestrictions.map((restriction) => (
                  <label key={restriction} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.dietaryRestrictions.includes(restriction)}
                      onChange={() => handleArrayToggle('dietaryRestrictions', restriction)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">{restriction}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Goal Alignment Info */}
          {filters.alignWithGoals && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Goal Alignment Active</h4>
              <div className="text-xs text-blue-800 space-y-1">
                <p>• Recipes will be scored based on how well they fit your nutrition goals</p>
                <p>• Higher protein recipes will be prioritized if you're below protein targets</p>
                <p>• Lower calorie options will be shown if you're over calorie targets</p>
                <p>• Recipes matching your health goals and dietary restrictions will rank higher</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
