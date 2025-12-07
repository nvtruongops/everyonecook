'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRecipesWithGroups,
  getRecipe,
  deleteRecipe,
  toggleFavorite,
  RecipesWithGroups,
  SavedRecipe,
} from '@/services/savedRecipes';
import { normalizeImageUrl, handleImageError } from '@/lib/image-utils';

type SortBy = 'name' | 'date';
type FilterBy = 'all' | 'favorites' | 'ai' | 'user' | 'social';

export default function ManageRecipePage() {
  return (
    <ProtectedRoute>
      <ManageRecipeContent />
    </ProtectedRoute>
  );
}

function ManageRecipeContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecipesWithGroups | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false); // Loading state for recipe detail
  const [openMenuId, setOpenMenuId] = useState<string | null>(null); // Track which recipe menu is open
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // Track which recipe is pending delete confirmation
  const [deleting, setDeleting] = useState(false); // Track delete in progress
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null); // Track which recipe is toggling favorite

  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (token && user) loadRecipes();
  }, [token, user]);

  async function loadRecipes(showLoading = true) {
    if (!token || !user) return;
    try {
      if (showLoading) setLoading(true);
      const userId = user.userId || user.sub || '';
      const result = await getRecipesWithGroups(token, userId);
      setData(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  // Fetch full recipe details when clicking on a card
  async function handleViewRecipe(recipe: SavedRecipe) {
    setLoadingDetail(true);
    setSelectedRecipe(recipe); // Show modal immediately with summary data

    try {
      // Fetch full details from API
      const fullRecipe = await getRecipe(recipe.saved_id, token || undefined);
      if (fullRecipe) {
        setSelectedRecipe(fullRecipe);
      }
    } catch (error) {
      console.error('Failed to fetch recipe details:', error);
      // Keep showing summary data if fetch fails
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleToggleFavorite(savedId: string) {
    if (togglingFavorite || !data) return;
    setTogglingFavorite(savedId);
    
    // Optimistic update - UI changes immediately, no reload needed
    const allRecipes = [...data.favorites, ...data.others];
    const recipe = allRecipes.find(r => r.saved_id === savedId);
    if (!recipe) { setTogglingFavorite(null); return; }
    
    const newFavoriteStatus = !recipe.is_favorite;
    const updatedRecipe = { ...recipe, is_favorite: newFavoriteStatus };
    const otherRecipes = allRecipes.filter(r => r.saved_id !== savedId);
    const newFavorites = newFavoriteStatus 
      ? [updatedRecipe, ...otherRecipes.filter(r => r.is_favorite)]
      : otherRecipes.filter(r => r.is_favorite);
    const newOthers = newFavoriteStatus
      ? otherRecipes.filter(r => !r.is_favorite)
      : [updatedRecipe, ...otherRecipes.filter(r => !r.is_favorite)];
    
    const oldData = data;
    setData({ ...data, favorites: newFavorites, others: newOthers });

    try {
      // Pass newFavoriteStatus directly - no need to fetch current status again
      await toggleFavorite(savedId, token || undefined, newFavoriteStatus);
      // No reload - optimistic update is the source of truth for this session
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      setData(oldData);
      alert('Không thể cập nhật yêu thích. Vui lòng thử lại.');
    } finally {
      setTogglingFavorite(null);
    }
  }

  async function handleDeleteRecipe(savedId: string) {
    setDeleting(true);
    try {
      await deleteRecipe(savedId, token || undefined);
      setSelectedRecipe(null);
      setConfirmDeleteId(null);
      setOpenMenuId(null);
      await loadRecipes();
    } catch (error) {
      console.error('Failed to delete recipe:', error);
    } finally {
      setDeleting(false);
    }
  }

  // Share recipe: Navigate to dashboard with recipe data pre-filled
  // Data will be COPIED when user clicks "Post" (not when clicking "Share")
  function handleShareRecipe(recipe: SavedRecipe) {
    // Store recipe data in sessionStorage for CreatePostForm to read
    const shareData = {
      recipe_id: recipe.saved_id,
      title: recipe.recipe_name,
      image: normalizeImageUrl(recipe.thumbnail || recipe.images?.completed) || null,
      // Include full recipe data for copying when post is created
      recipeData: {
        title: recipe.recipe_name,
        description: recipe.recipe_description,
        ingredients: recipe.recipe_ingredients,
        steps: recipe.recipe_steps,
        cookTime: recipe.cook_time,
        servings: recipe.servings,
        nutrition: recipe.nutrition,
        images: recipe.images,
      },
      // Include original author attribution for recipes saved from social
      // This ensures proper credit when re-sharing
      originalAuthor:
        recipe.source === 'saved' || recipe.source === 'imported'
          ? recipe.original_author_username
          : undefined,
    };
    sessionStorage.setItem('share_recipe', JSON.stringify(shareData));

    // Navigate to dashboard with share=recipe param
    // CreatePostForm will read from sessionStorage and pre-fill the form
    router.push('/dashboard?share=recipe');
  }

  const allRecipes = useMemo(() => {
    if (!data) return [];
    return [...data.favorites, ...data.others];
  }, [data]);

  const filteredRecipes = useMemo(() => {
    let recipes = allRecipes;

    // Filter by source/type
    if (filterBy === 'favorites') recipes = recipes.filter((r) => r.is_favorite);
    else if (filterBy === 'ai') recipes = recipes.filter((r) => r.source === 'ai');
    else if (filterBy === 'user')
      recipes = recipes.filter((r) => r.source === 'user' || r.source === 'manual');
    else if (filterBy === 'social')
      recipes = recipes.filter((r) => r.source === 'saved' || r.source === 'imported');

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      recipes = recipes.filter(
        (r) =>
          r.recipe_name.toLowerCase().includes(query) ||
          r.personal_notes?.toLowerCase().includes(query)
      );
    }

    // Sort recipes
    recipes = [...recipes].sort((a, b) => {
      // Favorites always come first (maintain favorite order by created_at)
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;

      // Then sort by selected criteria
      switch (sortBy) {
        case 'name':
          return (a.recipe_name || '').localeCompare(b.recipe_name || '', 'vi');
        case 'date':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });
    return recipes;
  }, [allRecipes, filterBy, searchQuery, sortBy]);

  const handleSelectAll = () => {
    if (selectedRecipes.size === filteredRecipes.length) setSelectedRecipes(new Set());
    else setSelectedRecipes(new Set(filteredRecipes.map((r) => r.saved_id)));
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Xóa ${selectedRecipes.size} món đã chọn?`)) return;
    try {
      await Promise.all(
        Array.from(selectedRecipes).map((id) => deleteRecipe(id, token || undefined))
      );
      setSelectedRecipes(new Set());
      await loadRecipes();
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#203d11] border-t-transparent mx-auto"></div>
          <p className="mt-4 text-[#203d11]/60 font-medium">Đang tải món ăn...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white pb-20 lg:pb-8">
      <div className="max-w-[1200px] mx-auto py-24 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#203d11] mb-2">Quản Lý Món Ăn</h1>
              <p className="text-[#203d11]/60">Quản lý và tổ chức món ăn của bạn</p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button onClick={() => router.push('/manageRecipe/new')} className="flex-1 sm:flex-none h-12 px-6 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] font-semibold shadow-lg transition-all flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Tạo món
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-[#203d11]/5">
              <div className="text-sm text-[#203d11]/60 mb-1">Tổng số món</div>
              <div className="text-3xl font-bold text-[#203d11]">{data?.total || 0}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-[#203d11]/5">
              <div className="text-sm text-[#203d11]/60 mb-1">Yêu thích</div>
              <div className="text-3xl font-bold text-[#975b1d]">{data?.favorites.length || 0}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 mb-6 border border-[#203d11]/5">
            <div className="flex flex-col lg:flex-row gap-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm món ăn..."
                className="flex-1 h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl focus:border-[#975b1d] focus:outline-none text-[#203d11] placeholder:text-[#203d11]/40 transition-all"
              />
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterBy)}
                className="h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] focus:border-[#975b1d] focus:outline-none transition-all"
              >
                <option value="all">Tất cả món</option>
                <option value="favorites">Yêu thích</option>
                <option value="ai">AI gợi ý</option>
                <option value="user">Tự tạo</option>
                <option value="social">Từ Social</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] focus:border-[#975b1d] focus:outline-none transition-all"
              >
                <option value="date">Mới nhất</option>
                <option value="name">Tên A-Z</option>
              </select>
            </div>
            {selectedRecipes.size > 0 && (
              <div className="mt-4 pt-4 border-t border-[#203d11]/10 flex items-center justify-between">
                <span className="text-sm text-[#203d11]/60">Đã chọn {selectedRecipes.size} món</span>
                <div className="flex gap-2">
                  <button onClick={handleBulkDelete} className="h-10 px-4 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-all">Xóa</button>
                  <button onClick={() => setSelectedRecipes(new Set())} className="h-10 px-4 bg-[#f5f0e8] text-[#203d11] rounded-xl text-sm font-medium hover:bg-[#e8e0d4] transition-all">Bỏ chọn</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-[#203d11]/60">Hiển thị <span className="font-semibold text-[#203d11]">{filteredRecipes.length}</span> món</p>
            {filteredRecipes.length > 0 && (
              <button onClick={handleSelectAll} className="text-sm text-[#975b1d] hover:text-[#7a4a17] font-medium transition-colors">
                {selectedRecipes.size === filteredRecipes.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            )}
          </div>

          {filteredRecipes.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
              {filteredRecipes.map((recipe) => (
                <div
                  key={recipe.saved_id}
                  onClick={() => handleViewRecipe(recipe)}
                  className={`bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer border ${selectedRecipes.has(recipe.saved_id) ? 'border-[#203d11] ring-2 ring-[#203d11]/20' : 'border-[#203d11]/5 hover:border-[#975b1d]/30'} overflow-hidden relative group`}
                >
                  {/* Thumbnail Image */}
                  <div className="aspect-square relative bg-stone-100">
                    {recipe.thumbnail || recipe.images?.completed ? (
                      <img
                        src={normalizeImageUrl(recipe.thumbnail || recipe.images?.completed) || ''}
                        alt={recipe.recipe_name}
                        className="w-full h-full object-cover"
                        onError={(e) => handleImageError(e, 'recipe')}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          className="w-12 h-12 text-stone-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                    {/* Source badge overlay */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium backdrop-blur-sm ${
                          recipe.source === 'ai'
                            ? 'bg-[#203d11]/80 text-white'
                            : recipe.source === 'saved' || recipe.source === 'imported'
                              ? 'bg-[#975b1d]/80 text-white'
                              : 'bg-white/80 text-stone-700'
                        }`}
                      >
                        {recipe.source === 'ai'
                          ? 'AI'
                          : recipe.source === 'saved' || recipe.source === 'imported'
                            ? 'Social'
                            : 'Tự tạo'}
                      </span>
                      {/* Show original author for social recipes */}
                      {(recipe.source === 'saved' || recipe.source === 'imported') &&
                        recipe.original_author_username && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium backdrop-blur-sm bg-black/50 text-white truncate max-w-[80px]">
                            @{recipe.original_author_username}
                          </span>
                        )}
                    </div>
                    {/* Action buttons - top right corner, always visible */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(recipe.saved_id);
                        }}
                        disabled={togglingFavorite === recipe.saved_id}
                        className="p-1.5 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition shadow-sm disabled:opacity-50"
                        title={recipe.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                      >
                        {togglingFavorite === recipe.saved_id ? (
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-[#975b1d] border-t-transparent" />
                        ) : (
                          <svg
                            className={`w-4 h-4 ${recipe.is_favorite ? 'text-[#975b1d]' : 'text-stone-500'}`}
                            fill={recipe.is_favorite ? 'currentColor' : 'none'}
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === recipe.saved_id ? null : recipe.saved_id);
                        }}
                        className="p-1.5 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition shadow-sm"
                      >
                        <svg
                          className="w-4 h-4 text-stone-500"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <circle cx="12" cy="6" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="p-3">
                    <h3 className="font-medium text-[#203d11] text-sm truncate mb-1">{recipe.recipe_name || 'Chưa có tên'}</h3>
                    <p className="text-xs text-[#203d11]/50">{recipe.recipe_ingredients.length} nguyên liệu</p>
                  </div>

                  {openMenuId === recipe.saved_id && (
                    <div className={`absolute right-2 top-14 bg-white rounded-xl shadow-xl border border-[#203d11]/10 py-1 z-20 ${confirmDeleteId === recipe.saved_id ? 'w-44' : 'w-36'}`} onClick={(e) => e.stopPropagation()}>
                      {recipe.source !== 'saved' && recipe.source !== 'imported' && (
                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); router.push(`/manageRecipe/${recipe.saved_id}/edit`); }} className="w-full px-4 py-2 text-left text-sm text-[#203d11] hover:bg-[#f5f0e8] transition-colors">Chỉnh sửa</button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleShareRecipe(recipe); }} className="w-full px-4 py-2 text-left text-sm text-[#203d11] hover:bg-[#f5f0e8] transition-colors">Chia sẻ</button>
                      <hr className="my-1 border-[#203d11]/10" />
                      {confirmDeleteId === recipe.saved_id ? (
                        <div className="px-3 py-2">
                          <p className="text-xs text-[#203d11]/60 mb-2">Xóa món này?</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteRecipe(recipe.saved_id); }} disabled={deleting} className="flex-1 px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">{deleting ? '...' : 'Xóa'}</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(null); }} disabled={deleting} className="flex-1 px-2 py-1 text-xs bg-[#f5f0e8] text-[#203d11] rounded-lg hover:bg-[#e8e0d4] disabled:opacity-50 transition-colors">Hủy</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(recipe.saved_id); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors">Xóa</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl shadow-lg border border-[#203d11]/5">
              <p className="text-[#203d11]/50 text-lg">Không tìm thấy món ăn</p>
            </div>
          )}

          {/* Click outside to close menu */}
          {openMenuId && (
            <div
              className="fixed inset-0 z-10"
              onClick={() => {
                setOpenMenuId(null);
                setConfirmDeleteId(null);
              }}
            />
          )}
        </div>
      </div>

      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRecipe(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[1200px] h-[calc(100vh-120px)] overflow-y-auto shadow-2xl mt-16 border border-[#203d11]/10" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-[#203d11] text-white p-5 rounded-t-2xl">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-4">
                  <h2 className="text-xl font-bold mb-1 truncate">
                    {selectedRecipe.recipe_name || 'Chưa có tên'}
                  </h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-1 rounded-full bg-white/20">
                      {selectedRecipe.source === 'ai'
                        ? 'AI gợi ý'
                        : selectedRecipe.source === 'saved' || selectedRecipe.source === 'imported'
                          ? 'Từ Social'
                          : 'Tự tạo'}
                    </span>
                    {/* Show original author for social recipes */}
                    {(selectedRecipe.source === 'saved' || selectedRecipe.source === 'imported') &&
                      selectedRecipe.original_author_username && (
                        <span className="text-xs px-2 py-1 rounded-full bg-white/20 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                              clipRule="evenodd"
                            />
                          </svg>
                          @{selectedRecipe.original_author_username}
                        </span>
                      )}
                    <span className="text-xs px-2 py-1 rounded-full bg-white/20">
                      {selectedRecipe.cook_time || 30} phút
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-white/20">
                      {selectedRecipe.servings || 2} người
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="text-white/80 hover:text-white text-2xl font-bold flex-shrink-0"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {loadingDetail && (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#203d11] border-t-transparent"></div>
                  <span className="ml-2 text-[#203d11]/50 text-sm">Đang tải chi tiết...</span>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/2 flex-shrink-0">
                  {selectedRecipe.images?.completed || selectedRecipe.thumbnail ? (
                    <div className="rounded-xl overflow-hidden">
                      <img src={normalizeImageUrl(selectedRecipe.images?.completed || selectedRecipe.thumbnail) || ''} alt={selectedRecipe.recipe_name} className="w-full h-auto max-h-[40vh] object-cover" onError={(e) => handleImageError(e, 'recipe')} />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#f5f0e8] h-[280px] flex items-center justify-center">
                      <svg className="w-16 h-16 text-[#203d11]/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                </div>

                <div className="md:w-1/2 flex flex-col gap-4">
                  {selectedRecipe.recipe_description && (
                    <div>
                      <h3 className="font-bold text-[#203d11] mb-2">Mô tả</h3>
                      <p className="text-[#203d11]/70 text-sm leading-relaxed">{selectedRecipe.recipe_description}</p>
                    </div>
                  )}
                  {selectedRecipe.personal_notes && (
                    <div>
                      <h3 className="font-bold text-[#203d11] mb-2">Ghi chú</h3>
                      <p className="text-[#203d11]/70 text-sm leading-relaxed">{selectedRecipe.personal_notes}</p>
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-[#203d11] mb-2">Nguyên liệu ({selectedRecipe.recipe_ingredients.length})</h3>
                    {selectedRecipe.recipe_ingredients.length > 0 ? (
                      <div className="space-y-1.5 max-h-[25vh] overflow-y-auto">
                        {selectedRecipe.recipe_ingredients.map((ing: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-[#f5f0e8]/50 rounded-xl text-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#203d11] flex-shrink-0" />
                            <span className="text-[#203d11] capitalize flex-1">{typeof ing === 'string' ? ing : ing.vietnamese || ing.vietnameseName || ing.name || ing.english || ''}</span>
                            {ing.amount && <span className="text-[#203d11]/50 text-xs">{ing.amount} {ing.unit || ''}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#203d11]/40 text-sm italic">{loadingDetail ? 'Đang tải...' : 'Chưa có nguyên liệu'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-[#203d11] mb-3">Các bước thực hiện</h3>
                {selectedRecipe.recipe_steps && selectedRecipe.recipe_steps.length > 0 ? (
                  <div className="space-y-4">
                    {selectedRecipe.recipe_steps.map((step: any, idx: number) => {
                      const stepImages = step.images || selectedRecipe.images?.steps?.[idx] || [];
                      return (
                        <div key={idx} className="bg-[#f5f0e8]/50 rounded-xl p-4">
                          <div className="flex gap-3 mb-2">
                            <div className="flex-shrink-0 w-8 h-8 bg-[#203d11] text-white rounded-full flex items-center justify-center font-bold text-sm">{step.stepNumber || idx + 1}</div>
                            <p className="text-[#203d11]/80 flex-1 pt-1">{typeof step === 'string' ? step : step.description || step.instruction || ''}</p>
                          </div>
                          {stepImages.length > 0 && (
                            <div className="mt-3 ml-11 flex flex-wrap gap-3">
                              {stepImages.map((img: string, imgIdx: number) => (
                                <div key={imgIdx} className="rounded-xl overflow-hidden shadow-sm border border-[#203d11]/10 flex-shrink-0">
                                  <img src={normalizeImageUrl(img) || ''} alt={`Bước ${idx + 1} - Ảnh ${imgIdx + 1}`} className="h-48 sm:h-56 w-auto object-contain bg-[#f5f0e8]/30" onError={(e) => handleImageError(e, 'recipe')} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[#203d11]/40 text-sm italic">{loadingDetail ? 'Đang tải...' : 'Chưa có bước nấu'}</p>
                )}
              </div>
            </div>

            {selectedRecipe.nutrition && (
              <div className="p-6 pt-0">
                <h3 className="font-bold text-[#203d11] mb-3">Thông tin dinh dưỡng</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#f5f0e8] rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-[#975b1d]">{selectedRecipe.nutrition.calories || 0}</div>
                    <div className="text-xs text-[#203d11]/50">Calories</div>
                  </div>
                  <div className="bg-[#f5f0e8] rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-[#203d11]">{selectedRecipe.nutrition.protein || 0}g</div>
                    <div className="text-xs text-[#203d11]/50">Protein</div>
                  </div>
                  <div className="bg-[#f5f0e8] rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-[#975b1d]">{selectedRecipe.nutrition.carbs || 0}g</div>
                    <div className="text-xs text-[#203d11]/50">Carbs</div>
                  </div>
                  <div className="bg-[#f5f0e8] rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-[#203d11]">{selectedRecipe.nutrition.fat || 0}g</div>
                    <div className="text-xs text-[#203d11]/50">Fat</div>
                  </div>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 bg-white border-t border-[#203d11]/10 p-4 rounded-b-2xl">
              <button onClick={() => setSelectedRecipe(null)} className="w-full h-12 bg-[#f5f0e8] text-[#203d11] rounded-xl font-semibold hover:bg-[#e8e0d4] transition-all">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
