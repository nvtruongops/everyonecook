'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';

interface Recipe {
  recipe_id: string;
  title: string;
  description?: string;
  ingredients: Array<{
    ingredient_name: string;
    quantity: string;
    unit?: string;
    is_optional?: boolean;
  }>;
  instructions: Array<{ step_number: number; description: string; duration?: string }>;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  cuisine_type?: string;
  cooking_method?: string;
  is_ai_generated?: boolean;
  created_at: string;
}

function RecipeDetailContent() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.recipeId as string;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recipeId) loadRecipe();
  }, [recipeId]);

  const loadRecipe = async () => {
    try {
      setLoading(true);
      const { getAuthHeaders } = await import('@/lib/token-helper');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const res = await fetch(`${apiUrl}/recipes/${recipeId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Failed to load recipe');
      const data = await res.json();
      setRecipe(data.data?.recipe || data.data);
    } catch {
      setError('Không thể tải công thức');
    } finally {
      setLoading(false);
    }
  };

  const totalTime = (recipe?.prep_time_minutes || 0) + (recipe?.cook_time_minutes || 0);

  return (
    <>
      <header className="bg-white shadow-sm sticky top-0 z-40 border-b border-[#203d11]/10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => router.back()}
              className="flex items-center space-x-2 text-[#203d11] hover:text-[#975b1d] h-12 font-semibold"
            >
              ← Quay lại
            </button>
            <a href="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#203d11] to-[#975b1d] rounded-lg flex items-center justify-center text-white">
                🍳
              </div>
              <span className="hidden sm:inline text-xl font-bold text-[#203d11]">
                Everyone Cook
              </span>
            </a>
          </div>
        </div>
      </header>

      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white pb-20 lg:pb-8">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]" />
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && recipe && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-[#203d11]/5">
              <div className="bg-gradient-to-r from-[#f5f0e8] to-white p-4 sm:p-8">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#203d11] mb-2">
                      {recipe.title}
                    </h1>
                    {recipe.description && (
                      <p className="text-sm sm:text-base text-[#203d11]/70 mb-4">
                        {recipe.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {recipe.is_ai_generated && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-[#975b1d]/10 text-[#975b1d]">
                          🤖 AI Generated
                        </span>
                      )}
                      {recipe.cuisine_type && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-[#203d11]/10 text-[#203d11]">
                          {recipe.cuisine_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-6">
                  {recipe.prep_time_minutes && (
                    <div className="bg-white rounded-2xl p-3 sm:p-4 text-center border border-[#203d11]/10">
                      <div className="text-2xl mb-1">⏱️</div>
                      <div className="text-lg sm:text-2xl font-bold text-[#203d11]">
                        {totalTime}
                      </div>
                      <div className="text-xs sm:text-sm text-[#203d11]/60">Phút</div>
                    </div>
                  )}
                  {recipe.servings && (
                    <div className="bg-white rounded-2xl p-3 sm:p-4 text-center border border-[#203d11]/10">
                      <div className="text-2xl mb-1">👥</div>
                      <div className="text-lg sm:text-2xl font-bold text-[#203d11]">
                        {recipe.servings}
                      </div>
                      <div className="text-xs sm:text-sm text-[#203d11]/60">Người</div>
                    </div>
                  )}
                  <div className="bg-white rounded-2xl p-3 sm:p-4 text-center border border-[#203d11]/10">
                    <div className="text-2xl mb-1">🥗</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#203d11]">
                      {recipe.ingredients.length}
                    </div>
                    <div className="text-xs sm:text-sm text-[#203d11]/60">Nguyên liệu</div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#203d11] mb-3 sm:mb-4 flex items-center gap-2">
                    🥗 Nguyên liệu
                  </h2>
                  <div className="bg-[#f5f0e8]/50 rounded-2xl p-4 sm:p-6 space-y-3 border border-[#203d11]/10">
                    {recipe.ingredients.map((ing, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <span className="text-[#203d11] mt-1">•</span>
                        <div className="flex-1">
                          <span className="text-sm sm:text-base font-semibold text-[#203d11]">
                            {ing.ingredient_name}
                          </span>
                          <span className="text-sm sm:text-base text-[#203d11]/70">
                            {' '}
                            - {ing.quantity}
                            {ing.unit && ` ${ing.unit}`}
                          </span>
                          {ing.is_optional && (
                            <span className="ml-2 text-xs sm:text-sm text-[#203d11]/50 italic">
                              (Tùy chọn)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#203d11] mb-3 sm:mb-4 flex items-center gap-2">
                    📝 Cách làm
                  </h2>
                  <div className="space-y-4 sm:space-y-6">
                    {recipe.instructions.map((ins, idx) => (
                      <div key={idx} className="flex gap-3 sm:gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#203d11] text-white rounded-full flex items-center justify-center text-base sm:text-lg font-bold">
                            {ins.step_number}
                          </div>
                        </div>
                        <div className="flex-1 pt-1 sm:pt-2">
                          <p className="text-sm sm:text-base text-[#203d11] leading-relaxed">
                            {ins.description}
                          </p>
                          {ins.duration && (
                            <p className="text-xs sm:text-sm text-[#203d11]/50 mt-2 flex items-center gap-1">
                              ⏱️ {ins.duration}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function RecipeDetailPage() {
  return (
    <ProtectedRoute>
      <RecipeDetailContent />
    </ProtectedRoute>
  );
}
