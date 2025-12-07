'use client';

import { useState } from 'react';
import { nutritionService } from '@/services/nutritionService';

interface SavedRecipe {
  recipe_id: string;
  title: string;
  description?: string;
  ingredients: Array<{
    ingredient_name: string;
    quantity: string;
    unit?: string;
  }>;
  instructions: Array<{
    step_number: number;
    description: string;
  }>;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  cuisine_type?: string;
  is_ai_generated?: boolean;
  created_at: string;
  nutrition?: any;
}

interface BulkNutritionCalculationProps {
  recipes: SavedRecipe[];
  onClose: () => void;
  onComplete: (updatedRecipes: SavedRecipe[]) => void;
}

interface CalculationProgress {
  recipeId: string;
  status: 'pending' | 'calculating' | 'completed' | 'failed';
  error?: string;
}

export default function BulkNutritionCalculation({ 
  recipes, 
  onClose, 
  onComplete 
}: BulkNutritionCalculationProps) {
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>(
    recipes.filter(r => !r.nutrition).map(r => r.recipe_id)
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState<CalculationProgress[]>([]);
  const [completed, setCompleted] = useState(false);

  const recipesWithoutNutrition = recipes.filter(recipe => !recipe.nutrition);
  const totalRecipes = selectedRecipes.length;
  const completedCount = progress.filter(p => p.status === 'completed' || p.status === 'failed').length;

  const handleRecipeToggle = (recipeId: string) => {
    setSelectedRecipes(prev => 
      prev.includes(recipeId)
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId]
    );
  };

  const handleSelectAll = () => {
    setSelectedRecipes(recipesWithoutNutrition.map(r => r.recipe_id));
  };

  const handleDeselectAll = () => {
    setSelectedRecipes([]);
  };

  const handleStartCalculation = async () => {
    if (selectedRecipes.length === 0) return;

    setIsCalculating(true);
    setCompleted(false);
    
    // Initialize progress
    const initialProgress = selectedRecipes.map(recipeId => ({
      recipeId,
      status: 'pending' as const
    }));
    setProgress(initialProgress);

    const updatedRecipes = [...recipes];
    
    // Process recipes sequentially to avoid overwhelming the API
    for (let i = 0; i < selectedRecipes.length; i++) {
      const recipeId = selectedRecipes[i];
      const recipe = recipes.find(r => r.recipe_id === recipeId);
      
      if (!recipe) continue;

      // Update progress to calculating
      setProgress(prev => prev.map(p => 
        p.recipeId === recipeId 
          ? { ...p, status: 'calculating' }
          : p
      ));

      try {
        const nutrition = await nutritionService.calculateAndSaveNutrition(
          recipeId,
          recipe.ingredients,
          recipe.servings || 1
        );

        // Update recipe with nutrition data
        const recipeIndex = updatedRecipes.findIndex(r => r.recipe_id === recipeId);
        if (recipeIndex !== -1) {
          updatedRecipes[recipeIndex] = { ...updatedRecipes[recipeIndex], nutrition };
        }

        // Update progress to completed
        setProgress(prev => prev.map(p => 
          p.recipeId === recipeId 
            ? { ...p, status: 'completed' }
            : p
        ));

        // Small delay between calculations to prevent API overload
        if (i < selectedRecipes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Failed to calculate nutrition for recipe ${recipeId}:`, error);
        
        // Update progress to failed
        setProgress(prev => prev.map(p => 
          p.recipeId === recipeId 
            ? { 
                ...p, 
                status: 'failed',
                error: error instanceof Error ? error.message : 'Calculation failed'
              }
            : p
        ));
      }
    }

    setIsCalculating(false);
    setCompleted(true);
    onComplete(updatedRecipes);
  };

  const getProgressPercentage = () => {
    if (totalRecipes === 0) return 0;
    return Math.round((completedCount / totalRecipes) * 100);
  };

  const getStatusIcon = (status: CalculationProgress['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-4 h-4 border-2 border-slate-300 rounded-full"></div>;
      case 'calculating':
        return <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>;
      case 'completed':
        return (
          <div className="w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Bulk Nutrition Calculation</h2>
            <p className="text-emerald-100 text-sm">
              Calculate nutrition for multiple recipes at once
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isCalculating}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {!isCalculating && !completed && (
            <>
              {/* Recipe Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">
                    Select Recipes ({selectedRecipes.length} of {recipesWithoutNutrition.length})
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-emerald-600 hover:text-emerald-700 transition"
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleDeselectAll}
                      className="text-sm text-slate-500 hover:text-slate-700 transition"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                  {recipesWithoutNutrition.length === 0 ? (
                    <div className="p-4 text-center text-slate-500">
                      All recipes already have nutrition data calculated.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {recipesWithoutNutrition.map(recipe => (
                        <label key={recipe.recipe_id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedRecipes.includes(recipe.recipe_id)}
                            onChange={() => handleRecipeToggle(recipe.recipe_id)}
                            className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 truncate">{recipe.title}</div>
                            <div className="text-sm text-slate-500">
                              {recipe.ingredients.length} ingredients • {recipe.servings || 1} servings
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartCalculation}
                  disabled={selectedRecipes.length === 0}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Calculate Nutrition ({selectedRecipes.length})
                </button>
              </div>
            </>
          )}

          {/* Progress Display */}
          {(isCalculating || completed) && (
            <div className="space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">
                    Progress: {completedCount} of {totalRecipes}
                  </span>
                  <span className="text-sm text-slate-500">{getProgressPercentage()}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  ></div>
                </div>
              </div>

              {/* Recipe Progress List */}
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                <div className="divide-y divide-slate-200">
                  {progress.map(item => {
                    const recipe = recipes.find(r => r.recipe_id === item.recipeId);
                    if (!recipe) return null;

                    return (
                      <div key={item.recipeId} className="flex items-center gap-3 p-3">
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{recipe.title}</div>
                          {item.status === 'failed' && item.error && (
                            <div className="text-sm text-red-600">{item.error}</div>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 capitalize">
                          {item.status === 'calculating' ? 'Calculating...' : item.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Completion Actions */}
              {completed && (
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
