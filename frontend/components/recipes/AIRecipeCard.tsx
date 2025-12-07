'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RecipeImage from '@/components/ui/RecipeImage';
import NutritionDisplay from '@/components/nutrition/NutritionDisplay';
import { Recipe } from '@/types/recipe';
import { NutritionProfile } from '@/types/nutrition';
import { nutritionService } from '@/services/nutritionService';
import { useAIRecipeSave } from '@/hooks/useAIRecipeSave';

interface AIRecipeCardProps {
  recipe: Recipe;
  priority?: boolean;
  autoCalculateNutrition?: boolean;
  onAction?: (recipeId: string, action: 'view' | 'save' | 'share') => void;
  onNutritionCalculated?: (recipeId: string, nutrition: NutritionProfile) => void;
}

interface NutritionState {
  nutrition: NutritionProfile | null;
  loading: boolean;
  error: string | null;
  calculationId: string | undefined;
}

/**
 * Enhanced AI Recipe Card with automatic nutrition calculation
 * 
 * Features:
 * - Automatic nutrition calculation for AI-generated recipes
 * - Real-time nutrition updates
 * - Retry functionality for failed calculations
 * - Compact and detailed nutrition views
 * - Integration with existing recipe display
 */
export default function AIRecipeCard({ 
  recipe, 
  priority = false, 
  autoCalculateNutrition = true,
  onAction,
  onNutritionCalculated
}: AIRecipeCardProps) {
  const router = useRouter();
  const [nutritionState, setNutritionState] = useState<NutritionState>({
    nutrition: null,
    loading: false,
    error: null,
    calculationId: undefined
  });
  const [showNutrition, setShowNutrition] = useState(false);
  const { 
    saving, 
    nutritionCalculating, 
    error: saveError, 
    success: saveSuccess,
    saveAIRecipe,
    reset: resetSave
  } = useAIRecipeSave();

  const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);

  // Auto-calculate nutrition for AI recipes
  useEffect(() => {
    if (autoCalculateNutrition && recipe.is_ai_generated && recipe.ingredients) {
      calculateNutrition();
    }
  }, [recipe.recipe_id, autoCalculateNutrition]);

  const calculateNutrition = async () => {
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      setNutritionState(prev => ({
        ...prev,
        error: 'No ingredients available for nutrition calculation'
      }));
      return;
    }

    setNutritionState(prev => ({
      ...prev,
      loading: true,
      error: null,
      calculationId: `calc_${recipe.recipe_id}_${Date.now()}`
    }));

    try {
      // Check if nutrition already exists
      const existingNutrition = await nutritionService.getNutritionProfile(recipe.recipe_id);
      if (existingNutrition) {
        setNutritionState(prev => ({
          ...prev,
          nutrition: existingNutrition,
          loading: false
        }));
        if (onNutritionCalculated) {
          onNutritionCalculated(recipe.recipe_id, existingNutrition);
        }
        return;
      }

      // Calculate new nutrition
      const ingredientTexts = recipe.ingredients.map(ing => {
        const parts = [ing.quantity, ing.unit, ing.ingredient_name].filter(Boolean);
        return parts.join(' ');
      });

      const nutrition = await nutritionService.calculateRecipeNutrition(
        recipe.recipe_id,
        ingredientTexts,
        recipe.servings || 1
      );

      setNutritionState(prev => ({
        ...prev,
        nutrition,
        loading: false,
        error: null
      }));

      if (onNutritionCalculated) {
        onNutritionCalculated(recipe.recipe_id, nutrition);
      }
    } catch (error) {
      console.error('Nutrition calculation failed:', error);
      setNutritionState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to calculate nutrition'
      }));
    }
  };

  const handleRetryNutrition = () => {
    calculateNutrition();
  };

  const handleView = () => {
    if (onAction) {
      onAction(recipe.recipe_id, 'view');
    } else {
      router.push(`/recipes/${recipe.recipe_id}`);
    }
  };

  const handleSave = async () => {
    if (onAction) {
      onAction(recipe.recipe_id, 'save');
    } else {
      try {
        // Reset any previous save state
        resetSave();

        // Save AI recipe with nutrition data if available
        await saveAIRecipe(
          recipe,
          nutritionState.nutrition || undefined,
          {
            includeNutrition: true,
            personalNotes: `AI-generated recipe saved on ${new Date().toLocaleDateString()}`,
            onSuccess: (result) => {
              console.log('Recipe saved successfully:', result);
              // Navigate to saved recipes after successful save
              setTimeout(() => {
                router.push('/saved-recipes');
              }, 1500);
            },
            onError: (error) => {
              console.error('Failed to save recipe:', error);
            }
          }
        );
      } catch (error) {
        console.error('Save operation failed:', error);
      }
    }
  };

  const toggleNutritionView = () => {
    setShowNutrition(!showNutrition);
    if (!showNutrition && !nutritionState.nutrition && !nutritionState.loading && !nutritionState.error) {
      calculateNutrition();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Recipe Image */}
      {recipe.image_url && (
        <RecipeImage
          src={recipe.image_url}
          alt={recipe.title}
          priority={priority}
          aspectRatio="video"
        />
      )}

      {/* Recipe Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {recipe.title}
        </h3>

        {/* Description */}
        {recipe.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {recipe.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-3">
          {recipe.is_ai_generated && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              🤖 AI Generated
            </span>
          )}
          {recipe.cuisine_type && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {recipe.cuisine_type}
            </span>
          )}
          {nutritionState.nutrition && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              ✓ Nutrition
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
          {totalTime > 0 && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{totalTime} min</span>
            </div>
          )}
          {recipe.servings && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{recipe.servings} servings</span>
            </div>
          )}
          {recipe.ingredients && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>{recipe.ingredients.length} ingredients</span>
            </div>
          )}
        </div>

        {/* Nutrition Display */}
        {(showNutrition || autoCalculateNutrition) && (
          <div className="mb-4">
            <NutritionDisplay
              nutrition={nutritionState.nutrition}
              loading={nutritionState.loading}
              error={nutritionState.error}
              compact={!showNutrition}
              showConfidence={true}
              showMethod={true}
              onRetry={handleRetryNutrition}
              realTimeUpdates={true}
              calculationId={nutritionState.calculationId}
            />
          </div>
        )}

        {/* Nutrition Toggle Button */}
        {!autoCalculateNutrition && (
          <button
            onClick={toggleNutritionView}
            className="w-full mb-3 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {showNutrition ? 'Hide Nutrition' : 'Show Nutrition'}
          </button>
        )}

        {/* Save Status Messages */}
        {(saving || nutritionCalculating || saveError || saveSuccess) && (
          <div className="mb-3">
            {nutritionCalculating && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-2 rounded-lg">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Calculating nutrition...
              </div>
            )}
            {saving && !nutritionCalculating && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded-lg">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Saving recipe...
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded-lg">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Recipe saved successfully! Redirecting...
              </div>
            )}
            {saveError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {saveError}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleView}
            className="flex-1 h-11 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
            disabled={saving || nutritionCalculating}
          >
            View Details
          </button>
          <button
            onClick={handleSave}
            disabled={saving || nutritionCalculating || saveSuccess}
            className={`h-11 px-4 rounded-lg transition font-medium text-sm flex items-center gap-2 ${
              saving || nutritionCalculating || saveSuccess
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {(saving || nutritionCalculating) && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {saveSuccess ? 'Saved!' : (saving || nutritionCalculating) ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
