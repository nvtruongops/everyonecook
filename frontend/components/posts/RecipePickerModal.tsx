/**
 * Recipe Picker Modal Component
 * Modal to select a recipe from user's saved recipes to share as post
 * Design: Professional with max-width 1200px, full recipe details
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeImageUrl } from '@/lib/image-utils';

interface Recipe {
  saved_id?: string;
  recipeId?: string;
  recipe_id?: string;
  title: string;
  description?: string;
  thumbnail?: string;
  images?: {
    completed?: string;
  };
  ingredients?: any[];
  recipe_ingredients?: any[];
  ingredientsCount?: number;
  steps?: any[];
  recipe_steps?: any[];
  servings?: number;
  cookingTime?: number;
  cook_time?: number;
  difficulty?: string;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  isShared?: boolean;
  source?: string;
}

interface RecipePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecipe: (recipe: Recipe) => void;
}

export default function RecipePickerModal({
  isOpen,
  onClose,
  onSelectRecipe,
}: RecipePickerModalProps) {
  const { token } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [expandedRecipeDetails, setExpandedRecipeDetails] = useState<Recipe | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen && token) {
      fetchRecipes();
    }
  }, [isOpen, token]);

  useEffect(() => {
    if (!isOpen) {
      setExpandedRecipeId(null);
      setExpandedRecipeDetails(null);
      setSelectedRecipe(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  const fetchRecipes = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/recipes?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch recipes');

      const data = await response.json();
      setRecipes(data.recipes || data.data?.recipes || []);
    } catch (err) {
      console.error('Error fetching recipes:', err);
      setError('Không thể tải danh sách món ăn');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipeDetails = async (recipeId: string) => {
    if (!token) return null;
    setLoadingDetails(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/recipes/${recipeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.recipe || data;
    } catch (err) {
      console.error('Error fetching recipe details:', err);
      return null;
    } finally {
      setLoadingDetails(false);
    }
  };

  const getRecipeId = (recipe: Recipe): string => {
    return recipe.recipeId || recipe.recipe_id || recipe.saved_id || '';
  };

  const getRecipeImage = (recipe: Recipe): string | null => {
    return normalizeImageUrl(recipe.thumbnail || recipe.images?.completed) || null;
  };

  const getIngredients = (recipe: Recipe): any[] => {
    return recipe.ingredients || recipe.recipe_ingredients || [];
  };

  const getSteps = (recipe: Recipe): any[] => {
    return recipe.steps || recipe.recipe_steps || [];
  };

  const getCookTime = (recipe: Recipe): number => {
    return recipe.cookingTime || recipe.cook_time || 0;
  };

  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectRecipe = () => {
    if (selectedRecipe) {
      const recipeToShare = expandedRecipeDetails || selectedRecipe;
      onSelectRecipe(recipeToShare);
      setSelectedRecipe(null);
      setSearchQuery('');
      setExpandedRecipeId(null);
      setExpandedRecipeDetails(null);
      onClose();
    }
  };

  const toggleExpand = async (recipe: Recipe) => {
    const recipeId = getRecipeId(recipe);

    if (expandedRecipeId === recipeId) {
      setExpandedRecipeId(null);
      setExpandedRecipeDetails(null);
    } else {
      setExpandedRecipeId(recipeId);
      setSelectedRecipe(recipe);

      const details = await fetchRecipeDetails(recipeId);
      if (details) {
        setExpandedRecipeDetails(details);
        setSelectedRecipe(details);
      }
    }
  };

  const handleSelect = (recipe: Recipe, e: React.MouseEvent) => {
    e.stopPropagation();
    const recipeToSelect = expandedRecipeDetails || recipe;
    setSelectedRecipe(recipeToSelect);
  };

  const getDifficultyLabel = (difficulty?: string) => {
    switch (difficulty) {
      case 'easy': return 'Dễ';
      case 'medium': return 'Trung bình';
      case 'hard': return 'Khó';
      default: return difficulty || '';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[1200px] h-[90vh] max-h-[900px] overflow-hidden shadow-2xl border border-[#203d11]/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-[#203d11]/10 bg-gradient-to-r from-[#f5f0e8] to-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#203d11]">Chọn món ăn để đăng</h2>
              <p className="text-sm text-[#203d11]/60 mt-1">Chọn từ danh sách món đã lưu của bạn</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[#203d11]/10 transition text-[#203d11]/60 hover:text-[#203d11]"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="mt-4 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên món ăn..."
              className="w-full pl-4 pr-10 py-3 bg-white border-2 border-[#203d11]/10 rounded-xl text-sm focus:outline-none focus:border-[#975b1d] text-[#203d11] placeholder-[#203d11]/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#203d11]/40 hover:text-[#203d11] transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Recipe List - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-16 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#203d11]/20 border-t-[#203d11] mx-auto"></div>
              <p className="mt-4 text-sm text-[#203d11]/60">Đang tải danh sách món ăn...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <p className="text-[#975b1d] text-sm mb-4">{error}</p>
              <button
                onClick={fetchRecipes}
                className="px-6 py-2.5 text-sm font-semibold text-[#203d11] hover:bg-[#f5f0e8] rounded-xl transition border border-[#203d11]/20"
              >
                Thử lại
              </button>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-20 h-20 bg-[#f5f0e8] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-[#203d11]">EC</span>
              </div>
              <p className="text-[#203d11]/70 text-sm mb-4">
                {searchQuery ? 'Không tìm thấy món ăn phù hợp' : 'Bạn chưa có món ăn nào'}
              </p>
              {!searchQuery && (
                <a
                  href="/manageRecipe"
                  className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-[#203d11] hover:bg-[#2a5016] rounded-xl transition"
                >
                  Tạo món ăn mới
                </a>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#203d11]/5">
              {filteredRecipes.map((recipe, index) => {
                const recipeId = getRecipeId(recipe) || `recipe-${index}`;
                const isExpanded = expandedRecipeId === recipeId;
                const isSelected = selectedRecipe && getRecipeId(selectedRecipe) === recipeId;
                const recipeImage = getRecipeImage(recipe);
                const displayRecipe = isExpanded && expandedRecipeDetails ? expandedRecipeDetails : recipe;
                const ingredients = getIngredients(displayRecipe);
                const steps = getSteps(displayRecipe);
                const cookTime = getCookTime(displayRecipe);

                return (
                  <div
                    key={recipeId}
                    className={`transition-all ${isSelected ? 'bg-[#f5f0e8] border-l-4 border-[#203d11]' : 'hover:bg-[#f5f0e8]/50'}`}
                  >
                    {/* Compact View */}
                    <div
                      className="p-5 flex items-center gap-5 cursor-pointer"
                      onClick={() => toggleExpand(recipe)}
                    >
                      {/* Image */}
                      {recipeImage ? (
                        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden flex-shrink-0 bg-[#f5f0e8]">
                          <Image src={recipeImage} alt={recipe.title} fill sizes="96px" className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                          <span className="text-xl font-bold text-[#203d11]/40">EC</span>
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[#203d11] text-lg truncate">{recipe.title}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-[#203d11]/60">
                          {cookTime > 0 && (
                            <span className="px-3 py-1 bg-[#f5f0e8] rounded-lg">{cookTime} phút</span>
                          )}
                          {recipe.difficulty && (
                            <span className="px-3 py-1 bg-[#f5f0e8] rounded-lg">{getDifficultyLabel(recipe.difficulty)}</span>
                          )}
                          {recipe.servings && recipe.servings > 0 && (
                            <span className="px-3 py-1 bg-[#f5f0e8] rounded-lg">{recipe.servings} người</span>
                          )}
                          {ingredients.length > 0 && (
                            <span className="px-3 py-1 bg-[#f5f0e8] rounded-lg">{ingredients.length} nguyên liệu</span>
                          )}
                        </div>
                      </div>

                      {/* Indicators */}
                      <div className="flex-shrink-0 flex items-center gap-3">
                        {isSelected && (
                          <div className="w-8 h-8 bg-[#203d11] rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        <div className="text-sm text-[#975b1d] font-medium">
                          {isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                        </div>
                        <svg
                          className={`w-5 h-5 text-[#203d11]/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded View - Full Details */}
                    {isExpanded && (
                      <div className="px-5 pb-5 bg-gradient-to-br from-[#f5f0e8]/50 to-white">
                        <div className="pt-5 border-t border-[#203d11]/10">
                          {loadingDetails ? (
                            <div className="py-12 text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#203d11]/20 border-t-[#203d11] mx-auto"></div>
                              <p className="mt-3 text-sm text-[#203d11]/60">Đang tải chi tiết món ăn...</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Left Column - Info & Ingredients */}
                              <div className="space-y-5">
                                {/* Description */}
                                {displayRecipe.description && (
                                  <div className="bg-white p-4 rounded-xl border border-[#203d11]/10">
                                    <h4 className="font-semibold text-[#203d11] mb-2">Mô tả</h4>
                                    <p className="text-sm text-[#203d11]/70 leading-relaxed">
                                      {displayRecipe.description}
                                    </p>
                                  </div>
                                )}

                                {/* Quick Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {ingredients.length > 0 && (
                                    <div className="bg-white p-3 rounded-xl border border-[#203d11]/10 text-center">
                                      <div className="text-2xl font-bold text-[#203d11]">{ingredients.length}</div>
                                      <div className="text-xs text-[#203d11]/60">Nguyên liệu</div>
                                    </div>
                                  )}
                                  {steps.length > 0 && (
                                    <div className="bg-white p-3 rounded-xl border border-[#203d11]/10 text-center">
                                      <div className="text-2xl font-bold text-[#203d11]">{steps.length}</div>
                                      <div className="text-xs text-[#203d11]/60">Bước</div>
                                    </div>
                                  )}
                                  {cookTime > 0 && (
                                    <div className="bg-white p-3 rounded-xl border border-[#203d11]/10 text-center">
                                      <div className="text-2xl font-bold text-[#203d11]">{cookTime}</div>
                                      <div className="text-xs text-[#203d11]/60">Phút</div>
                                    </div>
                                  )}
                                  {displayRecipe.servings && displayRecipe.servings > 0 && (
                                    <div className="bg-white p-3 rounded-xl border border-[#203d11]/10 text-center">
                                      <div className="text-2xl font-bold text-[#203d11]">{displayRecipe.servings}</div>
                                      <div className="text-xs text-[#203d11]/60">Người</div>
                                    </div>
                                  )}
                                </div>

                                {/* Nutrition */}
                                {displayRecipe.nutrition && (
                                  <div className="bg-[#975b1d]/5 p-4 rounded-xl">
                                    <h4 className="font-semibold text-[#975b1d] mb-3">Dinh dưỡng</h4>
                                    <div className="grid grid-cols-4 gap-2 text-center">
                                      {displayRecipe.nutrition.calories && (
                                        <div>
                                          <div className="text-lg font-bold text-[#975b1d]">{displayRecipe.nutrition.calories}</div>
                                          <div className="text-xs text-[#975b1d]/70">kcal</div>
                                        </div>
                                      )}
                                      {displayRecipe.nutrition.protein && (
                                        <div>
                                          <div className="text-lg font-bold text-[#975b1d]">{displayRecipe.nutrition.protein}g</div>
                                          <div className="text-xs text-[#975b1d]/70">protein</div>
                                        </div>
                                      )}
                                      {displayRecipe.nutrition.carbs && (
                                        <div>
                                          <div className="text-lg font-bold text-[#975b1d]">{displayRecipe.nutrition.carbs}g</div>
                                          <div className="text-xs text-[#975b1d]/70">carbs</div>
                                        </div>
                                      )}
                                      {displayRecipe.nutrition.fat && (
                                        <div>
                                          <div className="text-lg font-bold text-[#975b1d]">{displayRecipe.nutrition.fat}g</div>
                                          <div className="text-xs text-[#975b1d]/70">fat</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Ingredients List */}
                                {ingredients.length > 0 && (
                                  <div className="bg-white p-4 rounded-xl border border-[#203d11]/10">
                                    <h4 className="font-semibold text-[#203d11] mb-3">Nguyên liệu ({ingredients.length})</h4>
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                      {ingredients.map((ing: any, i: number) => (
                                        <div
                                          key={i}
                                          className="flex items-center gap-3 p-2 bg-[#f5f0e8]/50 rounded-lg"
                                        >
                                          <span className="w-6 h-6 bg-[#203d11]/10 rounded-full flex items-center justify-center text-xs font-semibold text-[#203d11]">
                                            {i + 1}
                                          </span>
                                          <span className="flex-1 text-sm text-[#203d11]">
                                            {ing.vietnamese || ing.name || ing}
                                          </span>
                                          {(ing.amount || ing.quantity) && (
                                            <span className="text-sm text-[#203d11]/60">
                                              {ing.amount || ing.quantity} {ing.unit || ''}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right Column - Steps */}
                              <div>
                                {steps.length > 0 && (
                                  <div className="bg-white p-4 rounded-xl border border-[#203d11]/10 h-full">
                                    <h4 className="font-semibold text-[#203d11] mb-3">Các bước thực hiện ({steps.length})</h4>
                                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                      {steps.map((step: any, i: number) => (
                                        <div key={i} className="flex gap-3">
                                          <div className="flex-shrink-0 w-8 h-8 bg-[#203d11] rounded-full flex items-center justify-center text-white font-bold text-sm">
                                            {i + 1}
                                          </div>
                                          <div className="flex-1 pt-1">
                                            <p className="text-sm text-[#203d11] leading-relaxed">
                                              {step.instruction || step.description || step.content || step}
                                            </p>
                                            {step.duration && (
                                              <p className="text-xs text-[#975b1d] mt-1">{step.duration} phút</p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {steps.length === 0 && (
                                  <div className="bg-[#f5f0e8]/50 p-8 rounded-xl text-center h-full flex items-center justify-center">
                                    <div>
                                      <p className="text-[#203d11]/60 text-sm">Chưa có hướng dẫn nấu</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          {!loadingDetails && (
                            <div className="flex gap-3 mt-6 pt-5 border-t border-[#203d11]/10">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRecipeId(null);
                                  setExpandedRecipeDetails(null);
                                }}
                                className="px-6 py-2.5 text-sm text-[#203d11]/60 hover:text-[#203d11] flex items-center justify-center gap-2 border border-[#203d11]/10 rounded-xl hover:bg-white transition font-medium"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                                Thu gọn
                              </button>
                              {!isSelected && (
                                <button
                                  onClick={(e) => handleSelect(displayRecipe, e)}
                                  className="px-6 py-2.5 text-sm text-white bg-[#203d11] hover:bg-[#2a5016] flex items-center justify-center gap-2 rounded-xl transition font-semibold shadow-md"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Chọn món này
                                </button>
                              )}
                              {isSelected && (
                                <div className="px-6 py-2.5 text-sm text-[#203d11] bg-[#203d11]/10 flex items-center justify-center gap-2 rounded-xl font-semibold">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Đã chọn
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-5 border-t border-[#203d11]/10 bg-[#f5f0e8]/30 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 md:flex-none md:w-40 px-6 py-3 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-white transition font-semibold"
          >
            Hủy
          </button>
          <button
            onClick={handleSelectRecipe}
            disabled={!selectedRecipe}
            className="flex-1 md:flex-none md:w-48 px-6 py-3 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg disabled:hover:shadow-md"
          >
            {selectedRecipe ? `Đăng "${selectedRecipe.title.slice(0, 15)}${selectedRecipe.title.length > 15 ? '...' : ''}"` : 'Chọn món để đăng'}
          </button>
        </div>
      </div>
    </div>
  );
}
