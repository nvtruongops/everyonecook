'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import AIRecipeGrid from '@/components/recipes/AIRecipeGrid';
import RecipeDetailModal from '@/components/recipes/RecipeDetailModal';
import CookingMode from '@/components/cooking/CookingMode';
import { Recipe, AISuggestionResponse } from '@/types/recipe';
import { NutritionProfile } from '@/types/nutrition';

// TODO: Implement AI suggestions API
interface AISuggestionRequest {
  ingredients: string[];
  recipe_count?: number;
}

export default function AISuggestionsPage() {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestionResponse | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [nutritionData, setNutritionData] = useState<Record<string, NutritionProfile>>({});

  // Load ingredients from sessionStorage
  useEffect(() => {
    const savedIngredients = sessionStorage.getItem('selected_ingredients');
    if (savedIngredients) {
      try {
        const parsed = JSON.parse(savedIngredients);
        setIngredients(parsed);
        // Auto-fetch suggestions
        fetchSuggestions(parsed);
      } catch (error) {
        console.error('Failed to parse ingredients:', error);
        setError('Không thể tải nguyên liệu đã chọn');
      }
    } else {
      setError('Không tìm thấy nguyên liệu. Vui lòng quay lại trang chọn nguyên liệu.');
    }
  }, []);

  const fetchSuggestions = async (ingredientsList: string[], recipeCount: number = 3) => {
    setIsLoading(true);
    setError(null);

    try {
      const request: AISuggestionRequest = {
        ingredients: ingredientsList,
        recipe_count: recipeCount,
      };

      // Call the AI suggestions API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/ai/suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      // Handle rate limit exceeded
      if (response.status === 429) {
        setError('Bạn đã hết lượt tìm kiếm hôm nay (5 lần/ngày). Vui lòng thử lại vào ngày mai.');
        setSuggestions({ recipes: [], suggestions: [], warnings: ['Rate limit exceeded'] });
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get suggestions');
      }

      // Transform API response to match expected format
      const recipes = data.data?.recipes || [];
      setSuggestions({
        recipes: recipes,
        suggestions: recipes, // Map to suggestions for compatibility
        warnings: [],
      });

      if (recipes.length === 0) {
        setError(
          'Không tìm thấy công thức phù hợp với nguyên liệu của bạn. Vui lòng thử lại với nguyên liệu khác.'
        );
      }
    } catch (err) {
      console.error('Failed to get AI suggestions:', err);
      setError(
        err instanceof Error ? err.message : 'Không thể lấy gợi ý công thức. Vui lòng thử lại.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecipeAction = (recipeId: string, action: 'view' | 'save' | 'share') => {
    const recipe = suggestions?.suggestions.find((r) => r.recipe_id === recipeId);
    if (!recipe) return;

    switch (action) {
      case 'view':
        setSelectedRecipe(recipe);
        setIsModalOpen(true);
        break;
      case 'save':
        // Handle save action
        router.push(`/recipes/${recipeId}/save`);
        break;
      case 'share':
        // Handle share action
        if (navigator.share) {
          navigator.share({
            title: recipe.title,
            text: recipe.description,
            url: `${window.location.origin}/recipes/${recipeId}`,
          });
        }
        break;
    }
  };

  const handleNutritionCalculated = (recipeId: string, nutrition: NutritionProfile) => {
    setNutritionData((prev) => ({
      ...prev,
      [recipeId]: nutrition,
    }));
  };

  const handleStartCooking = (recipe: Recipe) => {
    setCookingRecipe(recipe);
    setIsModalOpen(false);
  };

  const handleCookingComplete = async () => {
    console.log('Recipe completed');

    if (!cookingRecipe) return;

    try {
      // Import cooking service
      const { startCooking, completeCooking } = await import('@/services/cookingService');

      // Step 1: Start cooking session
      const session = await startCooking({
        recipe_id: cookingRecipe.recipe_id,
      });

      console.log('✅ Cooking session started:', session.session_id);

      // Step 2: Complete cooking session
      await completeCooking({
        session_id: session.session_id,
      });

      console.log('✅ Cooking session completed');

      // Reset state
      setCookingRecipe(null);

      // Clear ingredients from sessionStorage
      sessionStorage.removeItem('selected_ingredients');

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('❌ Failed to save cooking session:', error);
      // Still redirect even if save fails
      setCookingRecipe(null);
      sessionStorage.removeItem('selected_ingredients');
      router.push('/dashboard');
    }
  };

  const handleCookingCancel = () => {
    setCookingRecipe(null);
  };

  const handleBackToIngredients = () => {
    router.push('/cooking');
  };

  const handleRefresh = () => {
    if (ingredients.length > 0) {
      fetchSuggestions(ingredients);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <a href="/dashboard" className="text-xl font-bold text-gray-900">
                  Everyone Cook
                </a>
              </div>
              <div className="flex items-center space-x-4">
                <a
                  href="/dashboard"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </a>
                <a
                  href="/profile"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Profile
                </a>
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="max-w-7xl mx-auto py-4 sm:py-8 px-4 sm:px-6 lg:px-8 pb-20 lg:pb-8">
          {/* Page header */}
          <div className="mb-6 sm:mb-8">
            <button
              onClick={handleBackToIngredients}
              className="flex items-center text-blue-600 hover:text-blue-800 mb-4 min-h-[44px]"
            >
              <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span className="text-sm sm:text-base">Quay lại chọn nguyên liệu</span>
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gợi ý công thức</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600">
              Dựa trên {ingredients.length} nguyên liệu bạn đã chọn
            </p>
          </div>

          {/* Selected Ingredients */}
          {ingredients.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6 sm:mb-8">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                Nguyên liệu đã chọn
              </h2>
              <div className="flex flex-wrap gap-2">
                {ingredients.map((ingredient, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs sm:text-sm bg-green-100 text-green-800 border border-green-300"
                  >
                    {ingredient}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="bg-white rounded-lg shadow-md p-8 sm:p-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <svg
                    className="animate-spin h-12 w-12 sm:h-16 sm:w-16 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    Đang tạo gợi ý công thức...
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600">
                    AI đang phân tích nguyên liệu và tìm kiếm công thức phù hợp nhất cho bạn
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-center text-xs sm:text-sm text-gray-600">
                      <svg
                        className="animate-pulse h-4 w-4 mr-2 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Tìm kiếm công thức trong cơ sở dữ liệu...
                    </div>
                    <div className="flex items-center justify-center text-xs sm:text-sm text-gray-600">
                      <svg
                        className="animate-pulse h-4 w-4 mr-2 text-blue-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      AI đang tạo công thức mới...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6">
              <div className="flex items-start">
                <svg
                  className="h-6 w-6 text-red-600 mt-0.5 mr-3 flex-shrink-0"
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
                <div className="flex-1">
                  <h3 className="text-base sm:text-lg font-semibold text-red-900 mb-2">
                    Có lỗi xảy ra
                  </h3>
                  <p className="text-sm sm:text-base text-red-700 mb-4">{error}</p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button
                      onClick={handleRefresh}
                      className="px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                    >
                      Thử lại
                    </button>
                    <button
                      onClick={handleBackToIngredients}
                      className="px-4 py-2 min-h-[44px] bg-white text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                    >
                      Chọn lại nguyên liệu
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Success State - Recipe Suggestions */}
          {suggestions && !isLoading && !error && (
            <div className="space-y-6 sm:space-y-8">
              {/* Stats */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                      Tìm thấy {suggestions.suggestions.length} công thức phù hợp
                    </h3>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-700">
                      <div className="flex items-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 mr-2">
                          📚 {suggestions.stats.from_database}
                        </span>
                        <span>từ cơ sở dữ liệu</span>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 mr-2">
                          🤖 {suggestions.stats.from_ai}
                        </span>
                        <span>tạo bởi AI</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="w-full sm:w-auto flex items-center justify-center px-4 py-2 min-h-[44px] bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    <svg
                      className="h-5 w-5 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Làm mới
                  </button>
                </div>
              </div>

              {/* Warnings */}
              {suggestions.warnings && suggestions.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <svg
                      className="h-5 w-5 text-yellow-600 mt-0.5 mr-2"
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
                    <div>
                      <h4 className="text-sm font-medium text-yellow-900 mb-1">Lưu ý</h4>
                      <ul className="text-sm text-yellow-800 space-y-1">
                        {suggestions.warnings.map((warning, index) => (
                          <li key={index}>{warning.message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Recipe Grid with Nutrition */}
              <AIRecipeGrid
                recipes={suggestions.suggestions}
                loading={false}
                onRecipeAction={handleRecipeAction}
                onNutritionCalculated={handleNutritionCalculated}
                autoCalculateNutrition={true}
              />
            </div>
          )}
        </main>
      </div>

      {/* Recipe Detail Modal */}
      <RecipeDetailModal
        recipe={selectedRecipe}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStartCooking={handleStartCooking}
      />

      {/* Cooking Mode */}
      {cookingRecipe && (
        <CookingMode
          recipe={cookingRecipe}
          onComplete={handleCookingComplete}
          onCancel={handleCookingCancel}
        />
      )}
    </ProtectedRoute>
  );
}
