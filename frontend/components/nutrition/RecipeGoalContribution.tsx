'use client';

import React from 'react';
import { 
  NutritionProfile, 
  UserNutritionGoals,
  calculateNutritionProgress,
  getProgressColor
} from '@/types/nutrition';

interface RecipeGoalContributionProps {
  nutrition: NutritionProfile;
  goals: UserNutritionGoals;
  servings?: number;
  compact?: boolean;
  showAlerts?: boolean;
}

interface ContributionItem {
  label: string;
  value: number;
  target: number;
  unit: string;
  percentage: number;
  color: string;
  isHigh?: boolean;
}

export default function RecipeGoalContribution({ 
  nutrition, 
  goals, 
  servings = 1,
  compact = false,
  showAlerts = true
}: RecipeGoalContributionProps) {
  
  // Calculate actual contribution based on servings
  const actualNutrition = {
    calories: (nutrition.caloriesPerServing || 0) * servings,
    protein: (nutrition.proteinG || 0) * servings,
    carbs: (nutrition.carbohydratesG || 0) * servings,
    fat: (nutrition.fatG || 0) * servings,
    fiber: (nutrition.fiberG || 0) * servings,
    sodium: (nutrition.sodiumMg || 0) * servings
  };

  const contributions: ContributionItem[] = [
    {
      label: 'Calories',
      value: actualNutrition.calories,
      target: goals.dailyCaloriesTarget,
      unit: 'kcal',
      percentage: (actualNutrition.calories / goals.dailyCaloriesTarget) * 100,
      color: getProgressColor((actualNutrition.calories / goals.dailyCaloriesTarget) * 100),
      isHigh: actualNutrition.calories > goals.dailyCaloriesTarget * 0.5
    },
    {
      label: 'Protein',
      value: actualNutrition.protein,
      target: goals.proteinTargetG,
      unit: 'g',
      percentage: (actualNutrition.protein / goals.proteinTargetG) * 100,
      color: getProgressColor((actualNutrition.protein / goals.proteinTargetG) * 100)
    },
    {
      label: 'Carbs',
      value: actualNutrition.carbs,
      target: goals.carbsTargetG,
      unit: 'g',
      percentage: (actualNutrition.carbs / goals.carbsTargetG) * 100,
      color: getProgressColor((actualNutrition.carbs / goals.carbsTargetG) * 100)
    },
    {
      label: 'Fat',
      value: actualNutrition.fat,
      target: goals.fatTargetG,
      unit: 'g',
      percentage: (actualNutrition.fat / goals.fatTargetG) * 100,
      color: getProgressColor((actualNutrition.fat / goals.fatTargetG) * 100)
    },
    {
      label: 'Fiber',
      value: actualNutrition.fiber,
      target: goals.fiberTargetG,
      unit: 'g',
      percentage: (actualNutrition.fiber / goals.fiberTargetG) * 100,
      color: getProgressColor((actualNutrition.fiber / goals.fiberTargetG) * 100)
    },
    {
      label: 'Sodium',
      value: actualNutrition.sodium,
      target: goals.sodiumTargetMg,
      unit: 'mg',
      percentage: (actualNutrition.sodium / goals.sodiumTargetMg) * 100,
      color: getProgressColor((actualNutrition.sodium / goals.sodiumTargetMg) * 100),
      isHigh: actualNutrition.sodium > goals.sodiumTargetMg * 0.4
    }
  ];

  // Generate alerts
  const alerts = [];
  if (showAlerts) {
    if (actualNutrition.calories > goals.dailyCaloriesTarget * 0.6) {
      alerts.push({
        type: 'warning',
        message: 'High calorie content - consider smaller portion'
      });
    }
    if (actualNutrition.sodium > goals.sodiumTargetMg * 0.5) {
      alerts.push({
        type: 'warning',
        message: 'High sodium content'
      });
    }
    if (actualNutrition.protein > goals.proteinTargetG * 0.4) {
      alerts.push({
        type: 'positive',
        message: 'Excellent protein source'
      });
    }
    if (actualNutrition.fiber > goals.fiberTargetG * 0.3) {
      alerts.push({
        type: 'positive',
        message: 'Good source of fiber'
      });
    }
  }

  if (compact) {
    return (
      <div className="bg-gray-50 p-3 rounded-lg">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Daily Goal Contribution</span>
          {servings > 1 && (
            <span className="text-xs text-gray-500">({servings} servings)</span>
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-xs">
          {contributions.slice(0, 3).map((item) => (
            <div key={item.label} className="text-center">
              <div className={`font-semibold ${item.color}`}>
                {Math.round(item.percentage)}%
              </div>
              <div className="text-gray-600">{item.label}</div>
            </div>
          ))}
        </div>

        {alerts.length > 0 && (
          <div className="mt-2 space-y-1">
            {alerts.slice(0, 1).map((alert, index) => (
              <div
                key={index}
                className={`text-xs px-2 py-1 rounded ${
                  alert.type === 'positive'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Daily Goal Contribution</h3>
        {servings > 1 && (
          <span className="text-sm text-gray-500">({servings} servings)</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {contributions.map((item) => (
          <div key={item.label} className="text-center">
            <div className="mb-2">
              <div className={`text-2xl font-bold ${item.color}`}>
                {Math.round(item.percentage)}%
              </div>
              <div className="text-sm text-gray-600">{item.label}</div>
            </div>
            
            <div className="text-xs text-gray-500">
              {item.value.toFixed(1)} / {item.target} {item.unit}
            </div>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full ${
                  item.percentage > 100 ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(item.percentage, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Alerts and Recommendations */}
      {alerts.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Nutrition Insights</h4>
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`flex items-center text-sm px-3 py-2 rounded-md ${
                  alert.type === 'positive'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}
              >
                <span className="mr-2">
                  {alert.type === 'positive' ? '✓' : '⚠️'}
                </span>
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Macro Distribution Visualization */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Macro Distribution</h4>
        <div className="flex h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="bg-green-500"
            style={{ 
              width: `${(actualNutrition.protein * 4 / (actualNutrition.protein * 4 + actualNutrition.carbs * 4 + actualNutrition.fat * 9)) * 100}%` 
            }}
            title={`Protein: ${Math.round((actualNutrition.protein * 4 / (actualNutrition.protein * 4 + actualNutrition.carbs * 4 + actualNutrition.fat * 9)) * 100)}%`}
          />
          <div
            className="bg-blue-500"
            style={{ 
              width: `${(actualNutrition.carbs * 4 / (actualNutrition.protein * 4 + actualNutrition.carbs * 4 + actualNutrition.fat * 9)) * 100}%` 
            }}
            title={`Carbs: ${Math.round((actualNutrition.carbs * 4 / (actualNutrition.protein * 4 + actualNutrition.carbs * 4 + actualNutrition.fat * 9)) * 100)}%`}
          />
          <div
            className="bg-yellow-500"
            style={{ 
              width: `${(actualNutrition.fat * 9 / (actualNutrition.protein * 4 + actualNutrition.carbs * 4 + actualNutrition.fat * 9)) * 100}%` 
            }}
            title={`Fat: ${Math.round((actualNutrition.fat * 9 / (actualNutrition.protein * 4 + actualNutrition.carbs * 4 + actualNutrition.fat * 9)) * 100)}%`}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            Protein
          </span>
          <span className="flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
            Carbs
          </span>
          <span className="flex items-center">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
            Fat
          </span>
        </div>
      </div>
    </div>
  );
}
