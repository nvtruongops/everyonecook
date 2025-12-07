'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import ProtectedRoute from '@/components/ProtectedRoute';
import { getRecipe, updateRecipe, SavedRecipe } from '@/services/savedRecipes';
import { useAuth } from '@/contexts/AuthContext';

type RecipeSource = 'ai' | 'manual' | 'imported' | 'saved' | 'user';

interface EditPermissions {
  canEditName: boolean;
  canEditDescription: boolean;
  canEditIngredients: boolean;
  canEditSteps: boolean;
  canEditImages: boolean;
  canAddCompletedImage: boolean;
  canAddStepImages: boolean;
  maxStepImages: number;
  isReadOnly: boolean;
  message: string;
}

function getEditPermissions(source: RecipeSource): EditPermissions {
  switch (source) {
    case 'ai':
      return {
        canEditName: false,
        canEditDescription: false,
        canEditIngredients: false,
        canEditSteps: false,
        canEditImages: true,
        canAddCompletedImage: true,
        canAddStepImages: true,
        maxStepImages: 3,
        isReadOnly: false,
        message:
          '🤖 Công thức AI: Chỉ có thể thêm ảnh hoàn thành và ảnh cho các bước nấu (tối đa 3 ảnh/bước)',
      };
    case 'manual':
    case 'user':
      return {
        canEditName: true,
        canEditDescription: true,
        canEditIngredients: true,
        canEditSteps: true,
        canEditImages: true,
        canAddCompletedImage: true,
        canAddStepImages: true,
        maxStepImages: 3,
        isReadOnly: false,
        message: '👤 Công thức tự tạo: Có thể chỉnh sửa toàn bộ nội dung',
      };
    case 'imported':
    case 'saved':
    default:
      return {
        canEditName: false,
        canEditDescription: false,
        canEditIngredients: false,
        canEditSteps: false,
        canEditImages: false,
        canAddCompletedImage: false,
        canAddStepImages: false,
        maxStepImages: 0,
        isReadOnly: true,
        message: '📥 Công thức đã lưu từ Social: Không thể chỉnh sửa. Bạn chỉ có thể xem hoặc xóa.',
      };
  }
}

interface Ingredient {
  vietnamese?: string;
  vietnameseName?: string; // AI recipe format
  english?: string;
  name?: string;
  amount?: string;
  unit?: string;
}

interface Step {
  description?: string;
  instruction?: string;
  images?: string[];
}

function EditRecipeContent() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;
  const { token, isLoading: authLoading } = useAuth();
  const completedImageRef = useRef<HTMLInputElement>(null);
  const stepImageRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<EditPermissions | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [completedImage, setCompletedImage] = useState('');
  const [completedImagePreview, setCompletedImagePreview] = useState('');
  const [completedImageFile, setCompletedImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (!authLoading && token) {
      loadRecipe();
    }
  }, [recipeId, authLoading, token]);

  async function loadRecipe() {
    try {
      setLoading(true);
      const data = await getRecipe(recipeId, token || undefined);
      if (data) {
        setRecipe(data);
        const perms = getEditPermissions(data.source as RecipeSource);
        setPermissions(perms);

        // Initialize form state
        setName(data.recipe_name || '');
        setDescription(data.recipe_description || '');
        setIngredients(data.recipe_ingredients || []);
        setSteps(data.recipe_steps || []);
        // Load existing completed image
        if (data.images?.completed) {
          setCompletedImage(data.images.completed);
        }
      }
    } catch (err) {
      setError('Không thể tải công thức');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!permissions || permissions.isReadOnly) return;

    setSaving(true);
    try {
      const updates: Partial<SavedRecipe> = {};

      if (permissions.canEditName) updates.recipe_name = name;
      if (permissions.canEditDescription) updates.recipe_description = description;
      if (permissions.canEditIngredients) updates.recipe_ingredients = ingredients;
      // Always send steps if we can add step images (even if we can't edit step text)
      if (permissions.canEditSteps || permissions.canAddStepImages) {
        updates.recipe_steps = steps;
      }

      // Handle completed image changes
      if (permissions.canAddCompletedImage) {
        if (completedImageFile) {
          // Upload new image
          const cdnUrl = await uploadImageToS3(completedImageFile, 'completed');
          updates.images = { completed: cdnUrl };
        } else if (!completedImage && !completedImagePreview && recipe?.images?.completed) {
          // User deleted existing image (no new file, no preview, but had original)
          updates.images = { completed: '' };
        }
      }

      await updateRecipe(recipeId, updates, token || undefined);
      router.push('/manageRecipe');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      // Parse user-friendly error messages
      let displayMessage = errorMessage;
      if (errorMessage.includes('Upload limit exceeded') || errorMessage.includes('RATE_LIMIT')) {
        displayMessage =
          '⚠️ Đã vượt quá giới hạn upload (10 ảnh/ngày). Vui lòng thử lại vào ngày mai.';
      } else if (errorMessage.includes('UNAUTHORIZED')) {
        displayMessage = '🔒 Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
      } else if (errorMessage.includes('not found')) {
        displayMessage = '❌ Không tìm thấy công thức.';
      }
      setToast({ type: 'error', message: displayMessage });
    } finally {
      setSaving(false);
    }
  }

  // Ingredient handlers
  const addIngredient = () => {
    setIngredients([...ingredients, { vietnamese: '', amount: '', unit: 'g' }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: string, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  // Step handlers
  const addStep = () => {
    setSteps([...steps, { description: '', images: [] }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: string, value: string | string[]) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  };

  const addStepImage = (stepIndex: number, imageUrl: string) => {
    if (!permissions?.canAddStepImages) return;
    const step = steps[stepIndex];
    const currentImages = step.images || [];
    if (currentImages.length >= (permissions?.maxStepImages || 3)) {
      alert(`Tối đa ${permissions?.maxStepImages || 3} ảnh cho mỗi bước`);
      return;
    }
    updateStep(stepIndex, 'images', [...currentImages, imageUrl]);
  };

  const removeStepImage = (stepIndex: number, imageIndex: number) => {
    const step = steps[stepIndex];
    const currentImages = step.images || [];
    updateStep(
      stepIndex,
      'images',
      currentImages.filter((_, i) => i !== imageIndex)
    );
  };

  // Upload image to S3 using presigned URL
  const uploadImageToS3 = async (
    file: File,
    imageType: 'completed' | 'step',
    stepIndex?: number
  ): Promise<string> => {
    // Use simple filename - backend will add timestamp for uniqueness
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${imageType}${stepIndex !== undefined ? `-step${stepIndex}` : ''}.${extension}`;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
    const presignedResponse = await fetch(`${apiUrl}/upload/presigned-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileType: 'recipe',
        fileName,
        contentType: file.type,
        fileSize: file.size,
        subFolder: recipeId,
      }),
    });

    if (!presignedResponse.ok) {
      const error = await presignedResponse.json();
      throw new Error(error.error?.message || 'Failed to get upload URL');
    }

    const { uploadUrl, cdnUrl } = await presignedResponse.json();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload image to S3');
    }

    return cdnUrl;
  };

  // Handle completed image file selection
  const handleCompletedImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Ảnh không được vượt quá 5MB');
        return;
      }
      setCompletedImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCompletedImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Handle step image file selection
  const handleStepImageChange = async (
    stepIndex: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !permissions?.canAddStepImages) return;

    const step = steps[stepIndex];
    const currentImages = step.images || [];
    if (currentImages.length >= (permissions?.maxStepImages || 3)) {
      alert(`Tối đa ${permissions?.maxStepImages || 3} ảnh cho mỗi bước`);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh không được vượt quá 5MB');
      return;
    }

    try {
      setUploading(true);
      const cdnUrl = await uploadImageToS3(file, 'step', stepIndex);
      updateStep(stepIndex, 'images', [...currentImages, cdnUrl]);
    } catch (err) {
      alert('Lỗi upload ảnh: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setUploading(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-slate-600">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (error || !recipe || !permissions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Không tìm thấy công thức'}</p>
          <button
            onClick={() => router.push('/manageRecipe')}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  // READ-ONLY: Redirect or show message
  if (permissions.isReadOnly) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Không thể chỉnh sửa</h1>
            <p className="text-slate-600 mb-6">{permissions.message}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push('/manageRecipe')}
                className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
              >
                Quay lại
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 pb-24">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/manageRecipe')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Quay lại
          </button>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Chỉnh sửa công thức</h1>

          {/* Permission Banner */}
          <div
            className={`p-4 rounded-xl ${
              recipe.source === 'ai'
                ? 'bg-purple-50 border border-purple-200'
                : 'bg-blue-50 border border-blue-200'
            }`}
          >
            <p
              className={`text-sm ${recipe.source === 'ai' ? 'text-purple-700' : 'text-blue-700'}`}
            >
              {permissions.message}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
          {/* Recipe Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tên món</label>
            {permissions.canEditName ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                placeholder="Nhập tên món..."
              />
            ) : (
              <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-700">
                {name || 'Chưa có tên'}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Mô tả</label>
            {permissions.canEditDescription ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 resize-none"
                placeholder="Mô tả món ăn..."
              />
            ) : (
              <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-700 min-h-[80px]">
                {description || 'Chưa có mô tả'}
              </div>
            )}
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Nguyên liệu ({ingredients.length})
            </label>
            <div className="space-y-3">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {permissions.canEditIngredients ? (
                    <>
                      <input
                        type="text"
                        value={ing.vietnamese || ing.vietnameseName || ing.name || ''}
                        onChange={(e) => updateIngredient(idx, 'vietnamese', e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg text-slate-900"
                        placeholder="Tên nguyên liệu"
                      />
                      <input
                        type="text"
                        value={ing.amount || ''}
                        onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
                        className="w-24 px-3 py-2 border-2 border-slate-200 rounded-lg text-slate-900"
                        placeholder="Số lượng"
                      />
                      <button
                        onClick={() => removeIngredient(idx)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <svg
                          className="w-5 h-5"
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
                    </>
                  ) : (
                    <div className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-slate-700">
                      {ing.vietnamese || ing.vietnameseName || ing.name || ''}{' '}
                      {ing.amount && `- ${ing.amount}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {permissions.canEditIngredients && (
              <button
                onClick={addIngredient}
                className="mt-3 flex items-center gap-2 px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Thêm nguyên liệu
              </button>
            )}
          </div>

          {/* Steps */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Các bước nấu ({steps.length})
            </label>
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="border-2 border-slate-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-3">
                      {permissions.canEditSteps ? (
                        <textarea
                          value={step.description || step.instruction || ''}
                          onChange={(e) => updateStep(idx, 'description', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-slate-900 resize-none"
                          placeholder="Mô tả bước nấu..."
                        />
                      ) : (
                        <div className="px-3 py-2 bg-slate-100 rounded-lg text-slate-700">
                          {step.description || step.instruction || 'Chưa có mô tả'}
                        </div>
                      )}

                      {/* Step Images */}
                      {permissions.canAddStepImages && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">
                            Ảnh bước nấu ({step.images?.length || 0}/{permissions.maxStepImages})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {step.images?.map((img, imgIdx) => (
                              <div key={imgIdx} className="relative w-16 h-16">
                                <Image
                                  src={img}
                                  alt=""
                                  fill
                                  sizes="64px"
                                  className="object-cover rounded-lg"
                                />
                                <button
                                  onClick={() => removeStepImage(idx, imgIdx)}
                                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs z-10"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {(step.images?.length || 0) < permissions.maxStepImages && (
                              <label className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:border-emerald-500 hover:text-emerald-500 cursor-pointer">
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) => handleStepImageChange(idx, e)}
                                  className="hidden"
                                  disabled={uploading}
                                />
                                {uploading ? (
                                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent"></div>
                                ) : (
                                  <svg
                                    className="w-6 h-6"
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
                                )}
                              </label>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {permissions.canEditSteps && (
                      <button
                        onClick={() => removeStep(idx)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <svg
                          className="w-5 h-5"
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
                    )}
                  </div>
                </div>
              ))}
            </div>
            {permissions.canEditSteps && (
              <button
                onClick={addStep}
                className="mt-3 flex items-center gap-2 px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Thêm bước
              </button>
            )}
          </div>

          {/* Completed Image - For AI recipes */}
          {permissions.canAddCompletedImage && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ảnh món hoàn thành
              </label>
              <input
                type="file"
                ref={completedImageRef}
                onChange={handleCompletedImageChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <div className="flex items-center gap-4">
                {completedImagePreview || completedImage ? (
                  <div className="relative w-32 h-32">
                    <Image
                      src={completedImagePreview || completedImage}
                      alt="Completed"
                      fill
                      sizes="128px"
                      className="object-cover rounded-xl"
                    />
                    <button
                      onClick={() => {
                        setCompletedImage('');
                        setCompletedImagePreview('');
                        setCompletedImageFile(null);
                      }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full z-10"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => completedImageRef.current?.click()}
                    className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-emerald-500 hover:text-emerald-500"
                  >
                    <svg
                      className="w-8 h-8 mb-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-xs">Chọn ảnh</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <button
              onClick={() => router.push('/manageRecipe')}
              className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Đang lưu...
                </>
              ) : (
                'Lưu thay đổi'
              )}
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-md animate-slide-in ${
              toast.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : toast.type === 'warning'
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span className="flex-1 text-sm">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:opacity-70 transition-opacity"
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
        )}
      </div>
    </div>
  );
}

export default function EditRecipePage() {
  return (
    <ProtectedRoute>
      <EditRecipeContent />
    </ProtectedRoute>
  );
}
