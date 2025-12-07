/**
 * Create Post Form Component
 * Form to create new posts with text, image, and recipe
 * Task 17.2 - Pre-fill form with recipe information when shared
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { createPost } from '@/lib/api/posts';
import { shareRecipeToFeed } from '@/lib/api/recipes';
import { uploadPostImage } from '@/services/posts';
import { RecipeFormData } from '@/components/recipes/RecipeForm';
import CachedAvatar from '@/components/ui/CachedAvatar';
import RecipePickerModal from './RecipePickerModal';
import { normalizeImageUrl } from '@/lib/image-utils';

// Privacy options for custom dropdown
const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Công khai', icon: 'P' },
  { value: 'friends', label: 'Bạn bè', icon: 'F' },
  { value: 'private', label: 'Riêng tư', icon: 'R' },
] as const;

interface CreatePostFormProps {
  onPostCreated?: (post?: any) => void;
}

export default function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [content, setContent] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [recipeTitle, setRecipeTitle] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipeData, setRecipeData] = useState<RecipeFormData | null>(null);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [showPrivacyDropdown, setShowPrivacyDropdown] = useState(false);
  const [originalAuthor, setOriginalAuthor] = useState<string | null>(null); // For recipes saved from social
  const fileInputRef = useRef<HTMLInputElement>(null);
  const privacyDropdownRef = useRef<HTMLDivElement>(null);

  // Close privacy dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (privacyDropdownRef.current && !privacyDropdownRef.current.contains(e.target as Node)) {
        setShowPrivacyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debug: Log when recipeTitle changes (disabled in production)
  // useEffect(() => {
  //   console.log('[CreatePostForm] recipeTitle changed:', recipeTitle);
  //   console.log('[CreatePostForm] recipeId changed:', recipeId);
  // }, [recipeTitle, recipeId]);

  // Check for shared recipe or cooking session on mount (Task 17.2, 17.3)
  useEffect(() => {
    const shareType = searchParams?.get('share');
    // console.log('[CreatePostForm] Share type:', shareType);

    // Handle recipe sharing (Task 17.2)
    if (shareType === 'recipe') {
      const sharedRecipe = sessionStorage.getItem('share_recipe');
      // console.log('[CreatePostForm] Shared recipe from sessionStorage:', sharedRecipe);

      if (!sharedRecipe) {
        // console.log('[CreatePostForm] No shared recipe found in sessionStorage');
        return;
      }

      // Check if already loaded by comparing with current state
      try {
        const parsedData = JSON.parse(sharedRecipe);

        // Only set if different from current state (prevent re-setting on re-render)
        if (recipeId !== parsedData.recipe_id || recipeTitle !== parsedData.title) {
          // Pre-fill form with recipe data
          setRecipeId(parsedData.recipe_id);
          setRecipeTitle(parsedData.title);

          // Store full recipe data for preview (include image in recipeData)
          if (parsedData.recipeData) {
            const recipeDataWithImage = {
              ...parsedData.recipeData,
              // Store thumbnail for Recipe Tag preview
              thumbnail: parsedData.image,
            };
            setRecipeData(recipeDataWithImage as RecipeFormData);
          }

          // Set original author if this is a recipe saved from social
          if (parsedData.originalAuthor) {
            setOriginalAuthor(parsedData.originalAuthor);
          }

          // Leave content empty for user to write their own
          setContent('');

          // DON'T set imagePreviews - image should only show in Recipe Tag, not as separate upload
          // setImagePreviews([parsedData.image]); // REMOVED
        }
      } catch (err) {
        console.error('[CreatePostForm] Failed to parse shared recipe:', err);
      }
    }

    // Handle cooking session sharing (Task 17.3)
    if (shareType === 'cooking') {
      const sharedSession = sessionStorage.getItem('share_cooking_session');
      if (!sharedSession) return;

      try {
        const sessionData = JSON.parse(sharedSession);

        // Pre-fill form with cooking session data
        setRecipeId(sessionData.recipe_id);
        setRecipeTitle(sessionData.recipe_title);

        // Build star rating display
        const stars = sessionData.rating ? `${Math.floor(sessionData.rating)}/5` : '';

        // Pre-fill content with cooking experience
        const prefilledContent = `Just cooked "${sessionData.recipe_title}"! ${stars}\n\n${
          sessionData.notes || 'Great cooking experience!'
        }`;
        setContent(prefilledContent);

        // Set image preview if session has image
        if (sessionData.image) {
          setImagePreviews([sessionData.image]);
        }

        // Don't clear sessionStorage here - wait until post is created successfully
      } catch (err) {
        console.error('Failed to parse shared cooking session:', err);
      }
    }
  }, [searchParams, recipeId, recipeTitle]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check total images (current + new) - max 5 images
    if (imageFiles.length + files.length > 5) {
      setError(
        `Tối đa 5 ảnh. Bạn đã có ${imageFiles.length} ảnh, chỉ có thể thêm ${5 - imageFiles.length} ảnh nữa.`
      );
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of files) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`Ảnh "${file.name}" quá lớn. Tối đa 5MB mỗi ảnh.`);
        continue;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError(`"${file.name}" không phải là ảnh.`);
        continue;
      }

      validFiles.push(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === validFiles.length) {
          setImagePreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    }

    if (validFiles.length > 0) {
      setImageFiles((prev) => [...prev, ...validFiles]);
      setError(null);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle recipe selection from picker modal
  const handleRecipeSelect = (recipe: any) => {
    // API returns recipeId, frontend may have saved_id or recipe_id
    const id = recipe.recipeId || recipe.saved_id || recipe.recipe_id || '';
    console.log('[CreatePostForm] Selected recipe:', { id, title: recipe.title, recipe });
    setRecipeId(id);
    setRecipeTitle(recipe.title || '');
    setRecipeData({
      ...recipe,
      thumbnail: normalizeImageUrl(recipe.images?.completed) || undefined,
    } as RecipeFormData);
    setShowRecipePicker(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('You must be logged in to post');
      return;
    }

    // Validate form before uploading
    // Backend requires content (title) to always be present
    if (!content.trim()) {
      setError('Vui lòng nhập nội dung bài viết');
      return;
    }

    if (content.length > 5000) {
      setError('Nội dung bài viết không được vượt quá 5000 ký tự');
      return;
    }

    setLoading(true);
    setError(null);

    const uploadedTempKeys: string[] = [];
    const uploadedImageUrls: string[] = [];

    try {
      let tempKeys: string[] = [];
      let imageUrls: string[] = [];

      // Step 1: Upload all images to temp folder if present
      if (imageFiles.length > 0) {
        try {
          console.log(`[CreatePostForm] Uploading ${imageFiles.length} images to temp...`);

          // Upload images sequentially to temp folder
          for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            console.log(`[CreatePostForm] Uploading image ${i + 1}/${imageFiles.length}...`);

            const result = await uploadPostImage(token, file);
            uploadedTempKeys.push(result.tempKey);
            uploadedImageUrls.push(result.imageUrl);
            tempKeys.push(result.tempKey);
            imageUrls.push(result.imageUrl);

            console.log(`[CreatePostForm] Image ${i + 1} uploaded to temp:`, result.tempKey);
          }

          console.log('[CreatePostForm] All images uploaded to temp folder');
        } catch (uploadError) {
          console.error('[CreatePostForm] Image upload failed:', uploadError);
          // Images in temp folder will be auto-deleted by S3 lifecycle after 24h
          setError('Không thể tải ảnh lên. Vui lòng thử lại.');
          setLoading(false);
          return;
        }
      }

      // Step 2: Create post with temp keys (backend will move to permanent)
      // If recipeId exists, use shareRecipeToFeed to COPY recipe data to post
      // Otherwise, use createPost for regular posts
      let createdPost: any = null;
      try {
        if (recipeId?.trim()) {
          // Share recipe as post - backend will COPY recipe data (not reference)
          // This ensures deleting recipe won't affect post and vice versa
          console.log('[CreatePostForm] Sharing recipe as post, recipeId:', recipeId);
          const response = await shareRecipeToFeed({
            recipeId: recipeId!.trim(),
            title: content.trim() || undefined, // Use content as custom title
            images: imageUrls.length > 0 ? imageUrls : undefined,
            privacy: privacy,
          });
          createdPost = (response as any).post || response;
          console.log('[CreatePostForm] Shared recipe as post:', createdPost);
        } else {
          // Regular post without recipe
          const response = await createPost({
            content: content.trim(),
            privacy: privacy,
            // Send both tempKeys (for backend to move) and imageUrls (for display)
            tempImageKeys: tempKeys.length > 0 ? tempKeys : undefined,
            images: imageUrls.length > 0 ? imageUrls : undefined,
          });
          // Backend returns { message, post } via axios which wraps in response.data
          // createPost already returns response.data, so we get { message, post }
          createdPost = (response as any).post || response;
          console.log('[CreatePostForm] Created post:', createdPost);
        }
      } catch (postError: any) {
        console.error('[CreatePostForm] Create post failed:', postError);

        // Images in temp folder will be auto-deleted by S3 lifecycle after 24h
        // No manual cleanup needed!
        if (uploadedTempKeys.length > 0) {
          console.log(
            '[CreatePostForm] Post creation failed. Temp images will be auto-deleted in 24h:',
            uploadedTempKeys
          );
        }

        throw postError; // Re-throw to be caught by outer catch
      }

      // Reset form
      setContent('');
      setImageFiles([]);
      setImagePreviews([]);
      setRecipeId('');
      setRecipeTitle('');
      setPrivacy('public');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Clear shared recipe from sessionStorage after successful post
      sessionStorage.removeItem('share_recipe');
      sessionStorage.removeItem('share_cooking_session');

      // Clear URL params if sharing recipe
      if (searchParams?.get('share') === 'recipe') {
        router.replace('/dashboard', { scroll: false });
      }

      onPostCreated?.(createdPost);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <form onSubmit={handleSubmit}>
        {/* User Avatar & Input */}
        <div className="flex gap-3 mb-3">
          <CachedAvatar
            isCurrentUser
            alt={user.fullName || user.username || 'Your avatar'}
            size="md"
            fallbackText={user.fullName || user.username}
            priority
          />

          {/* Content Input */}
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Bạn đang nghĩ gì, ${user.fullName || 'Chef'}?`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm text-gray-900 placeholder-gray-500"
              rows={2}
              maxLength={5000}
            />
            <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
              <span className={!content.trim() ? 'text-red-500' : 'text-gray-400'}>* Bắt buộc</span>
              <span className={content.length > 4500 ? 'text-orange-500 font-medium' : ''}>
                {content.length} / 5000
              </span>
            </div>
          </div>
        </div>

        {/* Image Previews - Facebook/Instagram style grid (hidden when recipe attached) */}
        {imagePreviews.length > 0 && !recipeTitle && (
          <div className="mb-3">
            {/* Compact grid with 5 columns for thumbnails */}
            <div className="grid grid-cols-5 gap-1.5">
              {/* Show uploaded images as small thumbnails */}
              {imagePreviews.map((preview, index) => (
                <div
                  key={index}
                  className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
                >
                  <Image
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 60px, 80px"
                  />
                  {/* Hover overlay with delete button */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-700"
                      title="Xóa ảnh"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  {/* Image number badge */}
                  <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-black bg-opacity-60 text-white text-[10px] rounded flex items-center justify-center font-medium">
                    {index + 1}
                  </div>
                </div>
              ))}

              {/* Empty placeholder slots - show remaining slots up to 5 */}
              {imagePreviews.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer group"
                  title="Thêm ảnh"
                >
                  <svg
                    className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="text-[9px] text-gray-400 group-hover:text-emerald-500 font-medium">
                    +{5 - imagePreviews.length}
                  </span>
                </button>
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-emerald-600">{imagePreviews.length}</span>/5 ảnh
              </p>
              {imagePreviews.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setImageFiles([]);
                    setImagePreviews([]);
                  }}
                  className="text-xs text-red-500 hover:text-red-600 font-medium"
                >
                  Xóa tất cả
                </button>
              )}
            </div>
          </div>
        )}

        {/* Recipe Tag - Preview card */}
        {recipeTitle && (
          <div className="mb-3 bg-gradient-to-br from-[#f5f0e8] to-white border-2 border-[#203d11]/20 rounded-xl overflow-hidden">
            <div className="p-3">
              <div className="flex items-start gap-3">
                {/* Recipe thumbnail - from recipeData.thumbnail or images.completed */}
                {((recipeData as any)?.thumbnail || (recipeData as any)?.images?.completed) && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={normalizeImageUrl((recipeData as any)?.thumbnail || (recipeData as any)?.images?.completed) || ''}
                      alt={recipeTitle}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900 text-sm">{recipeTitle}</h4>
                  </div>
                  {recipeData && (
                    <>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
                        {((recipeData as any).ingredients ||
                          (recipeData as any).recipe_ingredients) && (
                          <span>
                            {Array.isArray((recipeData as any).ingredients)
                              ? (recipeData as any).ingredients.length
                              : Array.isArray((recipeData as any).recipe_ingredients)
                                ? (recipeData as any).recipe_ingredients.length
                                : 0}{' '}
                            nguyên liệu
                          </span>
                        )}
                        {((recipeData as any).steps || (recipeData as any).recipe_steps) && (
                          <span>
                            {Array.isArray((recipeData as any).steps)
                              ? (recipeData as any).steps.length
                              : Array.isArray((recipeData as any).recipe_steps)
                                ? (recipeData as any).recipe_steps.length
                                : 0}{' '}
                            bước
                          </span>
                        )}
                        {((recipeData as any).cookTime || (recipeData as any).cook_time) && (
                          <span>
                            {(recipeData as any).cookTime || (recipeData as any).cook_time} phút
                          </span>
                        )}
                        {(recipeData as any).servings && (
                          <span>{(recipeData as any).servings} người</span>
                        )}
                      </div>
                      {/* Nutrition info */}
                      {(recipeData as any).nutrition && (
                        <div className="flex flex-wrap gap-1.5 text-xs mb-2">
                          {(recipeData as any).nutrition.calories && (
                            <span className="px-1.5 py-0.5 bg-[#f5f0e8] text-[#203d11] rounded">
                              {(recipeData as any).nutrition.calories} cal
                            </span>
                          )}
                          {(recipeData as any).nutrition.protein && (
                            <span className="px-1.5 py-0.5 bg-[#f5f0e8] text-[#203d11] rounded">
                              {(recipeData as any).nutrition.protein}g protein
                            </span>
                          )}
                          {(recipeData as any).nutrition.carbs && (
                            <span className="px-1.5 py-0.5 bg-[#f5f0e8] text-[#203d11] rounded">
                              {(recipeData as any).nutrition.carbs}g carbs
                            </span>
                          )}
                          {(recipeData as any).nutrition.fat && (
                            <span className="px-1.5 py-0.5 bg-[#f5f0e8] text-[#203d11] rounded">
                              {(recipeData as any).nutrition.fat}g fat
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {/* Show original author attribution for recipes from social */}
                  {originalAuthor && (
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Nguồn: <span className="font-medium text-emerald-600">@{originalAuthor}</span>
                    </p>
                  )}
                  <p className="text-xs text-[#203d11] font-medium">
                    Công thức sẽ được đính kèm khi đăng bài
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRecipeId('');
                    setRecipeTitle('');
                    setRecipeData(null);
                    setImagePreviews([]);
                    setOriginalAuthor(null);
                    sessionStorage.removeItem('share_recipe');
                    sessionStorage.removeItem('share_cooking_session');
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                  title="Xóa món ăn"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-1">
            {/* Image Upload Button - Hidden when recipe is attached */}
            {!recipeTitle && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition text-sm font-medium"
                  title="Thêm ảnh"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Ảnh</span>
                </button>
              </>
            )}

            {/* Recipe Picker Button */}
            <button
              type="button"
              onClick={() => setShowRecipePicker(true)}
              disabled={!!recipeTitle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm font-medium ${
                recipeTitle
                  ? 'text-[#203d11]/40 cursor-not-allowed'
                  : 'text-[#203d11] hover:bg-[#f5f0e8]'
              }`}
              title={recipeTitle ? 'Đã chọn món ăn' : 'Chọn món ăn để đăng'}
            >
              <span className="hidden sm:inline">Đăng với món ăn</span>
            </button>

            {/* Privacy Selector - Custom Dropdown */}
            <div className="relative" ref={privacyDropdownRef}>
              <button
                type="button"
                onClick={() => setShowPrivacyDropdown(!showPrivacyDropdown)}
                className="flex items-center gap-2 pl-3 pr-2 py-1.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer"
              >
                <span>{PRIVACY_OPTIONS.find((o) => o.value === privacy)?.icon}</span>
                <span>{PRIVACY_OPTIONS.find((o) => o.value === privacy)?.label}</span>
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${showPrivacyDropdown ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Custom Dropdown Menu */}
              {showPrivacyDropdown && (
                <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 min-w-[140px]">
                  {PRIVACY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setPrivacy(option.value);
                        setShowPrivacyDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#f5f0e8] transition ${
                        privacy === option.value
                          ? 'bg-[#f5f0e8] text-[#203d11] font-medium'
                          : 'text-[#203d11]/70'
                      }`}
                    >
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                      {privacy === option.value && (
                        <svg
                          className="w-4 h-4 ml-auto text-[#203d11]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button - Always require content/title */}
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="px-8 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-all font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                Posting...
              </span>
            ) : (
              'Đăng bài'
            )}
          </button>
        </div>
      </form>

      {/* Recipe Picker Modal */}
      <RecipePickerModal
        isOpen={showRecipePicker}
        onClose={() => setShowRecipePicker(false)}
        onSelectRecipe={handleRecipeSelect}
      />
    </div>
  );
}
