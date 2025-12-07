'use client';

import React, { useEffect } from 'react';
import { Recipe, getCookingMethodLabel, getCookingMethodColor, formatTime, getTotalTime, getCuisineTypeLabel, getMealTypeLabel } from '@/types/recipe';

interface RecipeDetailModalProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
  onStartCooking?: (recipe: Recipe) => void;
}

export default function RecipeDetailModal({
  recipe,
  isOpen,
  onClose,
  onStartCooking
}: RecipeDetailModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !recipe) {
    return null;
  }

  const totalTime = getTotalTime(recipe);
  const source = recipe.is_ai_generated ? 'ai' : 'database';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 hover:bg-gray-100 transition-colors shadow-md"
          >
            <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Recipe Image */}
          <div className="relative h-64 bg-gradient-to-br from-blue-100 to-green-100">
            {recipe.image_url ? (
              <img
                src={recipe.image_url}
                alt={recipe.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="h-32 w-32 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}

            {/* Source Badge */}
            <div className="absolute top-4 left-4">
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                source === 'ai'
                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}>
                {source === 'ai' ? '🤖 AI Generated' : '📚 Database'}
              </span>
            </div>


          </div>

          {/* Recipe Content */}
          <div className="p-6">
            {/* Title and Description */}
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{recipe.title}</h2>
              {recipe.description && (
                <p className="text-gray-600">{recipe.description}</p>
              )}
            </div>

            {/* Recipe Meta Info */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getCookingMethodColor(recipe.cooking_method)}`}>
                {getCookingMethodLabel(recipe.cooking_method)}
              </div>

              {recipe.cuisine_type && (
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-300">
                  {getCuisineTypeLabel(recipe.cuisine_type)}
                </div>
              )}

              {recipe.meal_type && (
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-300">
                  {getMealTypeLabel(recipe.meal_type)}
                </div>
              )}
            </div>

            {/* Recipe Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-900">{formatTime(recipe.prep_time_minutes)}</div>
                <div className="text-xs text-gray-600">Chuẩn bị</div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-900">{formatTime(recipe.cook_time_minutes)}</div>
                <div className="text-xs text-gray-600">Nấu</div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-900">{formatTime(totalTime)}</div>
                <div className="text-xs text-gray-600">Tổng thời gian</div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-900">{recipe.servings}</div>
                <div className="text-xs text-gray-600">Khẩu phần</div>
              </div>
            </div>

            {/* Nutritional Info */}
            {recipe.nutritional_info && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">Thông tin dinh dưỡng (1 khẩu phần)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {recipe.nutritional_info.calories && (
                    <div>
                      <span className="text-gray-600">Calories: </span>
                      <span className="font-medium text-gray-900">{recipe.nutritional_info.calories} kcal</span>
                    </div>
                  )}
                  {recipe.nutritional_info.protein && (
                    <div>
                      <span className="text-gray-600">Protein: </span>
                      <span className="font-medium text-gray-900">{recipe.nutritional_info.protein}</span>
                    </div>
                  )}
                  {recipe.nutritional_info.carbs && (
                    <div>
                      <span className="text-gray-600">Carbs: </span>
                      <span className="font-medium text-gray-900">{recipe.nutritional_info.carbs}</span>
                    </div>
                  )}
                  {recipe.nutritional_info.fat && (
                    <div>
                      <span className="text-gray-600">Fat: </span>
                      <span className="font-medium text-gray-900">{recipe.nutritional_info.fat}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ingredients */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <svg className="h-6 w-6 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Nguyên liệu ({recipe.ingredients.length})
              </h3>
              <div className="space-y-2">
                {recipe.ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-start p-3 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                      <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium text-gray-900">{ingredient.ingredient_name}</span>
                        <span className="text-sm text-gray-600 ml-2">
                          {ingredient.quantity} {ingredient.unit || ''}
                        </span>
                      </div>
                      {ingredient.preparation && (
                        <p className="text-xs text-gray-600 mt-1">{ingredient.preparation}</p>
                      )}
                      {ingredient.is_optional && (
                        <span className="text-xs text-gray-500 italic">(Tùy chọn)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Button - Start Cooking */}
            {onStartCooking && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => onStartCooking(recipe)}
                  className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center shadow-lg"
                >
                  <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Bắt đầu nấu món này
                </button>
                <p className="text-center text-sm text-gray-500 mt-3">
                  Chế độ hướng dẫn từng bước với timer
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

