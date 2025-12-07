'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';


// Types for the simplified cooking page
interface BasicInput {
  ingredients: string[];
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'custom';
  servings: number; // 1-10
  maxTime: number; // 15-180 minutes
}

interface CookingPreferences {
  dislikedIngredients: string[];
  preferredCookingMethods: string[];
}

interface SearchResult {
  type: 'AI Suggestion' | 'Community Recipe' | 'Cache Hit';
  recipe: any;
  source: string;
  confidence?: number;
  similarity?: number;
  cacheStatus?: {
    status: 'cache_hit' | 'ai_generated' | 'loading';
    responseTime: number;
    cacheSource?: 'ai_cache' | 'user_recipe_cache';
  };
}

/**
 * Simplified Cooking Page Component
 * Theme: Extracted exactly from custom-message.ts
 * - Primary: #203d11 (Dark Green) -> Used for Headings, Main Buttons, Text
 * - Accent: #975b1d (Brown/Gold) -> Used for Highlights, Borders, Icons, Focus states
 * - Background: #f5f5f0 (Light Beige) -> Main page background
 * - Surface: #ffffff with shadow rgba(32, 61, 17, 0.15)
 */
export default function SimplifiedCookingPage() {
  const { user, token } = useAuth();
  const searchParams = useSearchParams();

  // Basic Input State
  const [basicInput, setBasicInput] = useState<BasicInput>({
    ingredients: [],
    mealType: 'custom',
    servings: 1,
    maxTime: 60,
  });

  const [currentIngredient, setCurrentIngredient] = useState('');
  const [processedIngredientParam, setProcessedIngredientParam] = useState<string | null>(null);

  // Pre-fill ingredient from URL parameter (from dashboard search) - only once
  useEffect(() => {
    const ingredientParam = searchParams?.get('ingredient');
    if (ingredientParam && ingredientParam !== processedIngredientParam) {
      const ingredient = decodeURIComponent(ingredientParam).trim();
      if (ingredient) {
        setBasicInput((prev) => {
          // Check if already exists to avoid duplicates
          if (prev.ingredients.includes(ingredient)) {
            return prev;
          }
          return {
            ...prev,
            ingredients: [...prev.ingredients, ingredient],
          };
        });
        setProcessedIngredientParam(ingredientParam);
      }
    }
  }, [searchParams, processedIngredientParam]);

  // Preferences State
  const [cookingPreferences, setCookingPreferences] = useState<CookingPreferences>({
    dislikedIngredients: [],
    preferredCookingMethods: [],
  });

  const [currentDislikedIngredient, setCurrentDislikedIngredient] = useState('');
  const [currentCookingMethod, setCurrentCookingMethod] = useState('');

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // --- Helpers ---
  // Parse ingredient string into individual ingredients (split by , and "và")
  const parseIngredients = (input: string): string[] => {
    return input
      .split(/[,]|\svà\s/i) // Split by comma or " và "
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  };

  // Get all individual ingredients from the ingredients list (handles comma-separated strings)
  const getAllIngredients = (): string[] => {
    const all: string[] = [];
    basicInput.ingredients.forEach((ing) => {
      parseIngredients(ing).forEach((parsed) => {
        if (!all.includes(parsed)) {
          all.push(parsed);
        }
      });
    });
    return all;
  };

  // Check if a disliked ingredient conflicts with any ingredient in the list
  const checkDislikedConflict = (disliked: string): string | null => {
    const dislikedLower = disliked.toLowerCase().trim();
    const allIngredients = getAllIngredients();
    
    for (const ing of allIngredients) {
      if (ing === dislikedLower || ing.includes(dislikedLower) || dislikedLower.includes(ing)) {
        return ing;
      }
    }
    return null;
  };

  // --- Handlers ---
  const addIngredient = () => {
    const trimmed = currentIngredient.trim();
    if (trimmed && !basicInput.ingredients.includes(trimmed)) {
      setBasicInput((prev) => ({
        ...prev,
        ingredients: [...prev.ingredients, trimmed],
      }));
      setCurrentIngredient('');
      setError(null);
    }
  };

  const removeIngredient = (index: number) => {
    setBasicInput((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  };

  const handleIngredientKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addIngredient();
    }
  };

  // Save recipe to manage recipes
  const handleSaveRecipe = async (recipe: any) => {
    if (!token) {
      setError('Vui lòng đăng nhập để lưu món');
      return;
    }

    setSavingRecipe(true);
    setSaveSuccess(null);

    try {
      // Transform AI recipe to saved recipe format (matching API expected structure)
      // Handle both string and object format for name
      const recipeTitle =
        typeof recipe.name === 'string'
          ? recipe.name
          : recipe.name?.vietnamese || recipe.recipe_name || recipe.title || 'Món ăn';
      const recipeData = {
        title: recipeTitle,
        description: recipe.description || '',
        ingredients:
          recipe.ingredients?.map((ing: any) => ({
            // Prioritize vietnameseName for Vietnamese display
            vietnamese: ing.vietnameseName || ing.vietnamese || ing.name?.replace(/-/g, ' ') || '',
            // ing.name from AI is English (lowercase-hyphen format)
            english: ing.name?.replace(/-/g, ' ') || ing.english || '',
            amount: `${ing.amount || ''} ${ing.unit || ''}`.trim(),
            notes: ing.importance === 'optional' ? 'Tùy chọn' : '',
          })) || [],
        steps:
          recipe.steps?.map((step: any, idx: number) => ({
            stepNumber: step.stepNumber || idx + 1,
            description: step.instruction || step.description || '',
            duration: step.duration || null,
            images: [],
          })) || [],
        images: { completed: '' },
        cookingTime: recipe.cookingTime || recipe.cookTime || recipe.cook_time || 30,
        servings: recipe.servings || basicInput.servings,
        difficulty: recipe.difficulty || 'medium',
        source: 'ai',
        attribution: 'AI Generated',
        nutrition: recipe.nutrition || null,
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/recipes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(recipeData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Lưu món thất bại');
      }

      setSaveSuccess(recipeData.title);
      setSelectedRecipe(null);

      // Show success message briefly
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      console.error('Save recipe error:', err);
      setError(err instanceof Error ? err.message : 'Lưu món thất bại');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (basicInput.ingredients.length === 0) {
      setError('Vui lòng nhập ít nhất một nguyên liệu');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchResults([]);

    try {
      const searchRequest = {
        ingredients: basicInput.ingredients,
        servings: Math.min(basicInput.servings, 3) as 1 | 2 | 3, // UI only allows 1-3
        mealType: (basicInput.mealType === 'custom' ? 'none' : basicInput.mealType) as any,
        // maxTime = 0 means "Tùy chọn" (no time limit), send 120 as max
        // Backend expects "maxCookingTime" field
        maxCookingTime: basicInput.maxTime === 0 ? 120 : (basicInput.maxTime as 30 | 60 | 90 | 120),
        dislikedIngredients:
          cookingPreferences.dislikedIngredients.length > 0
            ? cookingPreferences.dislikedIngredients
            : undefined,
        skillLevel: 'none' as const,
        preferredCookingMethods:
          cookingPreferences.preferredCookingMethods.length > 0
            ? (cookingPreferences.preferredCookingMethods as any[])
            : (['none'] as const),
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const response = await fetch(`${apiUrl}/ai/suggestions?t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(searchRequest),
      });

      if (response.status === 429) {
        setError('Bạn đã hết lượt tìm kiếm hôm nay (5 lần/ngày). Vui lòng thử lại vào ngày mai.');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();

      // Handle both response formats:
      // 1. Direct format: { status, recipes, cacheHit, ... }
      // 2. Wrapped format: { success, data: { recipes, fromCache, ... } }
      let responseData = data.data || data;
      let recipes = responseData.recipes || [];
      let fromCache = responseData.fromCache || responseData.cacheHit || false;

      // Check if job is pending - need to poll for results
      if (responseData.status === 'PENDING' && responseData.jobId) {
        // Poll for job status every 3 seconds, max 20 attempts (60 seconds)
        const maxAttempts = 20;
        const pollInterval = 3000;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          
          try {
            const statusResponse = await fetch(`${apiUrl}/ai/suggestions/${responseData.jobId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
              },
            });
            
            if (!statusResponse.ok) {
              continue;
            }
            
            const statusData = await statusResponse.json();
            
            if (statusData.status === 'COMPLETED' && statusData.recipes) {
              responseData = statusData;
              recipes = statusData.recipes || [];
              fromCache = false; // AI generated
              break;
            } else if (statusData.status === 'FAILED') {
              throw new Error(statusData.error || 'AI processing failed');
            }
            // Continue polling if still PENDING or PROCESSING
          } catch (pollError) {
            // Continue polling
          }
        }
        
        // If still no recipes after polling, show timeout message
        if (recipes.length === 0 && responseData.status !== 'COMPLETED') {
          setError('Đang xử lý yêu cầu AI. Vui lòng thử lại sau 30 giây.');
          return;
        }
      }

      if (recipes.length > 0 || responseData.status === 'COMPLETED') {
        let filteredRecipes = [...recipes];

        // Client-side filtering as safety net (filter by maxTime)
        // maxTime = 0 means "Tùy chọn" (no time limit), skip filtering
        const maxTime = basicInput.maxTime;
        if (maxTime > 0) {
          filteredRecipes = filteredRecipes.filter((recipe: any) => {
            const cookTime = recipe.cookTime || recipe.cookingTime || 0;
            return cookTime <= maxTime;
          });
        }



        const resultsWithCacheStatus = filteredRecipes.map((recipe: any, index: number) => ({
          type: fromCache ? 'Cache Hit' : 'AI Suggestion',
          recipe: {
            recipe_name:
              // Handle both string and object format for name
              typeof recipe.name === 'string'
                ? recipe.name
                : recipe.name?.vietnamese || recipe.name?.english || recipe.title || 'Món ăn',
            prep_time: 0, // Already included in cookingTime
            cook_time: recipe.cookingTime || recipe.cookTime || 30,
            total_time: recipe.cookingTime || recipe.cookTime || 30, // Total cooking time
            servings: recipe.servings || basicInput.servings,
            ...recipe,
          },
          source: fromCache ? 'AI Cache' : 'Bedrock AI',
          confidence: 0.9 - index * 0.1,
          cacheStatus: {
            status: fromCache ? 'cache_hit' : 'ai_generated',
            responseTime: 0,
            cacheSource: fromCache ? 'ai_cache' : undefined,
          },
        }));

        setSearchResults(resultsWithCacheStatus);

        if (filteredRecipes.length === 0) {
          setError('Không tìm thấy công thức phù hợp. Vui lòng thử với nguyên liệu khác.');
        }
      } else if (data.error) {
        throw new Error(data.error.message || data.error || 'Search failed');
      } else {
        throw new Error('Search failed');
      }
    } catch (error) {
      console.error('Search error:', error);
      setError(error instanceof Error ? error.message : 'Tìm kiếm thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white pb-20 lg:pb-8">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Page Header */}
        <div className="mb-10 flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl bg-[#203d11]">
            <span className="text-2xl font-bold text-white">EC</span>
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#203d11] tracking-tight">Tìm Món Ăn</h1>
            <p className="text-[#203d11]/60 mt-1">Khám phá công thức nấu ăn với AI</p>
          </div>
        </div>

        {/* Main Search Form */}
        <div className="bg-white rounded-2xl p-6 md:p-8 mb-8 shadow-xl border border-[#203d11]/5">
          <form onSubmit={handleSearch} className="space-y-8">
            {/* Ingredients Section */}
            <div className="space-y-4">
              <label className="block text-xl font-bold text-[#203d11]">Nguyên liệu bạn có</label>

              {basicInput.ingredients.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {basicInput.ingredients.map((ingredient, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#f5f0e8] border border-[#975b1d]/30 text-[#975b1d] rounded-xl text-sm font-semibold hover:bg-[#975b1d]/10 transition"
                    >
                      {ingredient}
                      <button
                        type="button"
                        onClick={() => removeIngredient(index)}
                        className="hover:text-[#203d11] transition-colors text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Input Field */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={currentIngredient}
                  onChange={(e) => setCurrentIngredient(e.target.value)}
                  onKeyDown={handleIngredientKeyPress}
                  placeholder="VD: thịt gà, cà chua, nấm..."
                  className="flex-1 h-12 px-5 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder:text-[#203d11]/40 focus:outline-none focus:border-[#975b1d] transition-all"
                />
                <button
                  type="button"
                  onClick={addIngredient}
                  disabled={!currentIngredient.trim()}
                  className="px-6 h-12 bg-[#203d11] text-white font-semibold rounded-xl hover:bg-[#2a5016] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Thêm
                </button>
              </div>
            </div>

            <div className="h-px bg-[#203d11]/10"></div>

            {/* Controls */}
            <div className="space-y-6">
              {/* Meal Type - Button Group */}
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-[#203d11] mb-3">Bữa ăn</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'breakfast', label: 'Sáng' },
                    { value: 'lunch', label: 'Trưa' },
                    { value: 'dinner', label: 'Tối' },
                    { value: 'snack', label: 'Ăn vặt' },
                    { value: 'custom', label: 'Tùy chỉnh' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBasicInput((prev) => ({ ...prev, mealType: option.value as any }))}
                      className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                        basicInput.mealType === option.value
                          ? 'bg-[#203d11] text-white shadow-md'
                          : 'bg-[#f5f0e8] text-[#203d11]/70 hover:bg-[#203d11]/10 hover:text-[#203d11]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Servings & Time Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Servings - Button Group (1-3 người) */}
                <div>
                  <label className="block text-sm font-semibold text-[#203d11] mb-3">Khẩu phần (người)</label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBasicInput((prev) => ({ ...prev, servings: value }))}
                        className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                          basicInput.servings === value
                            ? 'bg-[#203d11] text-white shadow-md'
                            : 'bg-[#f5f0e8] text-[#203d11]/70 hover:bg-[#203d11]/10 hover:text-[#203d11]'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time - Button Group */}
                <div>
                  <label className="block text-sm font-semibold text-[#203d11] mb-3">Thời gian (phút)</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {[30, 60, 90, 120].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBasicInput((prev) => ({ ...prev, maxTime: value }))}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          basicInput.maxTime === value
                            ? 'bg-[#203d11] text-white shadow-md'
                            : 'bg-[#f5f0e8] text-[#203d11]/70 hover:bg-[#203d11]/10 hover:text-[#203d11]'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                    {/* "Tùy chọn" = không giới hạn thời gian */}
                    <button
                      type="button"
                      onClick={() => setBasicInput((prev) => ({ ...prev, maxTime: 0 }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        basicInput.maxTime === 0
                          ? 'bg-[#203d11] text-white shadow-md'
                          : 'bg-[#f5f0e8] text-[#203d11]/70 hover:bg-[#203d11]/10 hover:text-[#203d11]'
                      }`}
                    >
                      Tùy chọn
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Options */}
            <div className="bg-[#f5f0e8]/50 rounded-xl p-5 md:p-6 border border-[#203d11]/5">
              <h3 className="text-[#203d11] font-bold mb-4">Tùy chỉnh nâng cao</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Disliked */}
                <div>
                  <label className="block text-sm font-semibold text-[#975b1d] mb-2">
                    Tránh nguyên liệu
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentDislikedIngredient}
                      onChange={(e) => setCurrentDislikedIngredient(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = currentDislikedIngredient.trim();
                          if (!trimmed) return;
                          
                          // Check conflict with all ingredients (including parsed from comma-separated strings)
                          const conflict = checkDislikedConflict(trimmed);
                          if (conflict) {
                            setError(`"${trimmed}" trùng với nguyên liệu "${conflict}" trong danh sách. Không thể tránh nguyên liệu bạn muốn dùng.`);
                            return;
                          }
                          
                          if (!cookingPreferences.dislikedIngredients.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
                            setCookingPreferences((prev) => ({
                              ...prev,
                              dislikedIngredients: [...prev.dislikedIngredients, trimmed],
                            }));
                            setCurrentDislikedIngredient('');
                            setError(null);
                          }
                        }
                      }}
                      placeholder="VD: hành, tỏi..."
                      className="flex-1 h-10 px-4 text-sm border-2 border-transparent bg-white rounded-xl focus:border-[#975b1d] focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = currentDislikedIngredient.trim();
                        if (!trimmed) return;
                        
                        // Check conflict with all ingredients (including parsed from comma-separated strings)
                        const conflict = checkDislikedConflict(trimmed);
                        if (conflict) {
                          setError(`"${trimmed}" trùng với nguyên liệu "${conflict}" trong danh sách. Không thể tránh nguyên liệu bạn muốn dùng.`);
                          return;
                        }
                        
                        if (!cookingPreferences.dislikedIngredients.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
                          setCookingPreferences((prev) => ({
                            ...prev,
                            dislikedIngredients: [...prev.dislikedIngredients, trimmed],
                          }));
                          setCurrentDislikedIngredient('');
                          setError(null);
                        }
                      }}
                      className="px-4 h-10 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition"
                    >
                      Chặn
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cookingPreferences.dislikedIngredients.map((item, idx) => (
                      <span key={idx} className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg flex items-center gap-1.5 font-medium">
                        {item}
                        <button onClick={() => setCookingPreferences((prev) => ({ ...prev, dislikedIngredients: prev.dislikedIngredients.filter((_, i) => i !== idx) }))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Preferred Method */}
                <div>
                  <label className="block text-sm font-semibold text-[#975b1d] mb-2">
                    Phương pháp nấu
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentCookingMethod}
                      onChange={(e) => setCurrentCookingMethod(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = currentCookingMethod.trim();
                          if (trimmed && !cookingPreferences.preferredCookingMethods.includes(trimmed)) {
                            setCookingPreferences((prev) => ({ ...prev, preferredCookingMethods: [...prev.preferredCookingMethods, trimmed] }));
                            setCurrentCookingMethod('');
                          }
                        }
                      }}
                      placeholder="VD: hấp, kho..."
                      className="flex-1 h-10 px-4 text-sm border-2 border-transparent bg-white rounded-xl focus:border-[#975b1d] focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = currentCookingMethod.trim();
                        if (trimmed && !cookingPreferences.preferredCookingMethods.includes(trimmed)) {
                          setCookingPreferences((prev) => ({ ...prev, preferredCookingMethods: [...prev.preferredCookingMethods, trimmed] }));
                          setCurrentCookingMethod('');
                        }
                      }}
                      className="px-4 h-10 bg-[#975b1d] text-white rounded-xl text-sm font-semibold hover:bg-[#7a4a17] transition"
                    >
                      Thêm
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cookingPreferences.preferredCookingMethods.map((item, idx) => (
                      <span key={idx} className="text-xs px-2.5 py-1 bg-[#f5f0e8] text-[#975b1d] border border-[#975b1d]/20 rounded-lg flex items-center gap-1.5 font-medium">
                        {item}
                        <button onClick={() => setCookingPreferences((prev) => ({ ...prev, preferredCookingMethods: prev.preferredCookingMethods.filter((_, i) => i !== idx) }))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || basicInput.ingredients.length === 0}
              className="w-full h-14 bg-[#203d11] text-white rounded-xl shadow-lg hover:bg-[#2a5016] hover:shadow-xl transition-all font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
                  <span>Đang tìm kiếm...</span>
                </>
              ) : (
                <span>Tìm Công Thức</span>
              )}
            </button>

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl">
                <p className="font-medium">{error}</p>
              </div>
            )}

            {/* Success */}
            {saveSuccess && (
              <div className="p-4 bg-[#203d11]/10 border border-[#203d11]/20 text-[#203d11] rounded-xl">
                <p className="font-medium">Đã lưu "{saveSuccess}" vào quản lý món ăn!</p>
              </div>
            )}
          </form>
        </div>

        {/* Results */}
        {searchResults.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#203d11]">Kết quả tìm kiếm</h2>
              <span className="bg-[#975b1d] text-white px-4 py-1.5 rounded-xl text-sm font-semibold">
                {searchResults.length} món
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedRecipe(result.recipe)}
                  className="bg-white rounded-2xl p-5 shadow-xl border border-[#203d11]/5 hover:border-[#975b1d]/30 hover:shadow-2xl transition-all group cursor-pointer"
                >
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#975b1d] px-2 py-0.5 bg-[#f5f0e8] rounded-lg">
                        AI Gợi ý
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#203d11] group-hover:text-[#975b1d] transition-colors line-clamp-2">
                      {result.recipe?.recipe_name || 'Món ăn'}
                    </h3>
                  </div>

                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-[#203d11]/70">
                      <span className="font-bold text-[#203d11]">
                        {result.recipe?.cookingTime || result.recipe?.total_time || result.recipe?.cook_time || '--'}
                      </span>
                      <span>phút</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#203d11]/70">
                      <span className="font-bold text-[#203d11]">{result.recipe?.servings || '--'}</span>
                      <span>người</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[#203d11]/5">
                    <span className="text-sm text-[#975b1d] font-medium group-hover:text-[#203d11] transition">
                      Xem chi tiết →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-8 bg-white rounded-2xl shadow-xl p-12 text-center border border-[#203d11]/5">
            <div className="inline-block animate-spin w-10 h-10 border-4 border-[#203d11]/20 border-t-[#203d11] rounded-full mb-4"></div>
            <p className="text-[#203d11] font-medium">Đang tìm công thức phù hợp...</p>
          </div>
        )}
      </div>

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6"
          onClick={() => setSelectedRecipe(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[1200px] max-h-[90vh] overflow-hidden shadow-2xl border border-[#203d11]/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-[#203d11] text-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2">
                    {typeof selectedRecipe.name === 'string'
                      ? selectedRecipe.name
                      : selectedRecipe.name?.vietnamese || selectedRecipe.recipe_name || 'Món ăn'}
                  </h2>
                  {selectedRecipe.name?.english && (
                    <p className="text-white/70 text-sm">{selectedRecipe.name.english}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition text-white"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                <span className="px-4 py-1.5 bg-white/10 rounded-xl text-sm font-medium">
                  {selectedRecipe.cookingTime || selectedRecipe.cook_time || '--'} phút
                </span>
                <span className="px-4 py-1.5 bg-white/10 rounded-xl text-sm font-medium">
                  {selectedRecipe.servings || '--'} người
                </span>
                <span className="px-4 py-1.5 bg-white/10 rounded-xl text-sm font-medium capitalize">
                  {selectedRecipe.difficulty === 'easy' ? 'Dễ' : selectedRecipe.difficulty === 'hard' ? 'Khó' : 'Trung bình'}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Description */}
                  {selectedRecipe.description && (
                    <div className="bg-[#f5f0e8]/50 p-4 rounded-xl">
                      <p className="text-[#203d11]/80 leading-relaxed">{selectedRecipe.description}</p>
                    </div>
                  )}

                  {/* Nutrition */}
                  {selectedRecipe.nutrition && (
                    <div className="bg-[#975b1d]/5 p-5 rounded-xl">
                      <h3 className="text-lg font-bold text-[#975b1d] mb-4">Dinh dưỡng</h3>
                      <div className="grid grid-cols-4 gap-3 text-center">
                        {selectedRecipe.nutrition.calories && (
                          <div>
                            <div className="text-2xl font-bold text-[#975b1d]">{Math.round(selectedRecipe.nutrition.calories)}</div>
                            <div className="text-xs text-[#975b1d]/70">kcal</div>
                          </div>
                        )}
                        {selectedRecipe.nutrition.protein && (
                          <div>
                            <div className="text-2xl font-bold text-[#975b1d]">{Math.round(selectedRecipe.nutrition.protein)}g</div>
                            <div className="text-xs text-[#975b1d]/70">protein</div>
                          </div>
                        )}
                        {selectedRecipe.nutrition.carbs && (
                          <div>
                            <div className="text-2xl font-bold text-[#975b1d]">{Math.round(selectedRecipe.nutrition.carbs)}g</div>
                            <div className="text-xs text-[#975b1d]/70">carbs</div>
                          </div>
                        )}
                        {selectedRecipe.nutrition.fat && (
                          <div>
                            <div className="text-2xl font-bold text-[#975b1d]">{Math.round(selectedRecipe.nutrition.fat)}g</div>
                            <div className="text-xs text-[#975b1d]/70">fat</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ingredients */}
                  <div className="bg-white p-5 rounded-xl border border-[#203d11]/10">
                    <h3 className="text-lg font-bold text-[#203d11] mb-4">
                      Nguyên liệu ({selectedRecipe.ingredients?.length || 0})
                    </h3>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {selectedRecipe.ingredients?.map((ing: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-[#f5f0e8]/50 rounded-xl">
                          <span className="w-7 h-7 bg-[#203d11]/10 rounded-full flex items-center justify-center text-xs font-bold text-[#203d11]">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-[#203d11] font-medium">
                            {ing.vietnameseName || (typeof ing.name === 'string' ? ing.name.replace(/-/g, ' ') : ing.name?.vietnamese || ing.name?.english || 'Nguyên liệu')}
                          </span>
                          <span className="text-sm text-[#203d11]/60">
                            {ing.amount} {ing.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column - Steps */}
                <div className="bg-white p-5 rounded-xl border border-[#203d11]/10 h-fit">
                  <h3 className="text-lg font-bold text-[#203d11] mb-4">
                    Các bước thực hiện ({selectedRecipe.steps?.length || 0})
                  </h3>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {selectedRecipe.steps?.map((step: any, idx: number) => (
                      <div key={idx} className="flex gap-4">
                        <div className="flex-shrink-0 w-9 h-9 bg-[#203d11] text-white rounded-full flex items-center justify-center font-bold">
                          {step.stepNumber || idx + 1}
                        </div>
                        <div className="flex-1 pt-1">
                          <p className="text-[#203d11] leading-relaxed">{step.instruction}</p>
                          {step.duration && (
                            <span className="text-sm text-[#975b1d] mt-2 inline-block font-medium">
                              {step.duration} phút
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 bg-[#f5f0e8]/50 border-t border-[#203d11]/10 p-5">
              <div className="flex gap-4">
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="flex-1 md:flex-none md:w-40 py-3 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl font-semibold hover:bg-white transition"
                >
                  Đóng
                </button>
                <button
                  onClick={() => handleSaveRecipe(selectedRecipe)}
                  disabled={savingRecipe}
                  className="flex-1 md:flex-none md:w-48 py-3 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {savingRecipe ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                      Đang lưu...
                    </>
                  ) : (
                    'Lưu món'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
