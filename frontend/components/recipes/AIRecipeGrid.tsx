'use client';

import { useState } from 'react';
import AIRecipeCard from './AIRecipeCard';
import { Recipe } from '@/types/recipe';
import { NutritionProfile } from '@/types/nutrition';

interface AIRecipeGridProps {
  recipes: Recipe[];
  loading?: boolean;
  onRecipeAction?: (recipeId: string, action: 'view' | 'save' | 'share') => void;
  onNutritionCalculated?: (recipeId: string, nutrition: NutritionProfile) => void;
  autoCalculateNutrition?: boolean;
}

/**
 * Grid component for displaying AI-generated recipes with nutrition integration
 */
export default function AIRecipeGrid({
  recipes,
  loading = false,
  onRecipeAction,
  onNutritionCalculated,
  autoCalculateNutrition = true
}: AIRecipeGridProps) {
  const [nutritionData, setNutritionData] = useState<Record<string, NutritionProfile>>({});

  const handleNutritionCalculated = (recipeId: string, nutrition: NutritionProfile) => {
    setNutritionData(prev => ({
      ...prev,
      [recipeId]: nutrition
    }));

    if (onNutritionCalculated) {
      onNutritionCalculated(recipeId, nutrition);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm overflow-hidden animate-pulse">
            <div className="h-48 bg-gray-200"></div>
            <div className="p-4">
              <div className="h-6 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 bg-gray-200 rounded mb-3"></div>
              <div className="flex gap-2 mb-3">
                <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
                <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
              </div>
              <div className="flex gap-4 mb-4">
                <div className="h-4 w-16 bg-gray-200 rounded"></div>
                <div className="h-4 w-20 bg-gray-200 rounded"></div>
              </div>
              <div className="h-11 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No recipes found</h3>
        <p className="mt-1 text-sm text-gray-500">
          Try adjusting your ingredients or search criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Nutrition Summary */}
      {Object.keys(nutritionData).length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Nutrition Overview
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-600">
                {Object.values(nutritionData).length}
              </div>
              <div className="text-gray-600">Recipes with nutrition</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {Math.round(
                  Object.values(nutritionData).reduce((sum, n) => sum + n.caloriesPerServing, 0) /
                  Object.values(nutritionData).length
                )}
              </div>
              <div className="text-gray-600">Avg calories</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">
                {Math.round(
                  Object.values(nutritionData).reduce((sum, n) => sum + n.proteinG, 0) /
                  Object.values(nutritionData).length
                )}g
              </div>
              <div className="text-gray-600">Avg protein</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-orange-600">
                {Math.round(
                  Object.values(nutritionData).reduce((sum, n) => sum + n.confidence, 0) /
                  Object.values(nutritionData).length * 100
                )}%
              </div>
              <div className="text-gray-600">Avg confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map((recipe, index) => (
          <AIRecipeCard
            key={recipe.recipe_id}
            recipe={recipe}
            priority={index < 3} // Prioritize first 3 images
            autoCalculateNutrition={autoCalculateNutrition}
            onAction={onRecipeAction}
            onNutritionCalculated={handleNutritionCalculated}
          />
        ))}
      </div>

      {/* Nutrition Calculation Status */}
      {autoCalculateNutrition && recipes.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          <p>
            Nutrition information is automatically calculated for AI-generated recipes.
            Calculations may take a few seconds to complete.
          </p>
        </div>
      )}
    </div>
  );
}
