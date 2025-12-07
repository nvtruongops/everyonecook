'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

interface Ingredient {
  vietnamese: string;
  amount: string;
}

interface Instruction {
  stepNumber: number;
  description: string;
  imageFiles: File[];
  imagePreviews: string[];
}

const MAX_STEP_IMAGES = 3;

// Toast notification type
type ToastType = 'success' | 'error' | 'warning';

function CreateRecipeContent() {
  const router = useRouter();
  const { token } = useAuth();
  const completedImageRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState(2);
  const [cookTime, setCookTime] = useState(30);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [completedImageFile, setCompletedImageFile] = useState<File | null>(null);
  const [completedImagePreview, setCompletedImagePreview] = useState<string>('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ vietnamese: '', amount: '' }]);
  const [instructions, setInstructions] = useState<Instruction[]>([
    { stepNumber: 1, description: '', imageFiles: [], imagePreviews: [] },
  ]);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Show toast notification
  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000); // Auto hide after 3s
  };

  // Completed image handler
  const handleCompletedImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('Ảnh không được vượt quá 5MB', 'warning');
        return;
      }
      setCompletedImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCompletedImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Step image handlers
  const handleStepImageChange = (stepIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const currentImages = instructions[stepIndex].imageFiles;
    const remainingSlots = MAX_STEP_IMAGES - currentImages.length;

    if (remainingSlots <= 0) {
      showToast(`Mỗi bước chỉ được tối đa ${MAX_STEP_IMAGES} ảnh`, 'warning');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        showToast(`Ảnh ${file.name} vượt quá 5MB`, 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setInstructions((prev) => {
          const updated = [...prev];
          updated[stepIndex] = {
            ...updated[stepIndex],
            imageFiles: [...updated[stepIndex].imageFiles, file],
            imagePreviews: [...updated[stepIndex].imagePreviews, reader.result as string],
          };
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const removeStepImage = (stepIndex: number, imageIndex: number) => {
    setInstructions((prev) => {
      const updated = [...prev];
      updated[stepIndex] = {
        ...updated[stepIndex],
        imageFiles: updated[stepIndex].imageFiles.filter((_, i) => i !== imageIndex),
        imagePreviews: updated[stepIndex].imagePreviews.filter((_, i) => i !== imageIndex),
      };
      return updated;
    });
  };

  // Ingredient handlers
  const addIngredient = () => {
    setIngredients([...ingredients, { vietnamese: '', amount: '' }]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  // Instruction handlers
  const addInstruction = () => {
    setInstructions([
      ...instructions,
      { stepNumber: instructions.length + 1, description: '', imageFiles: [], imagePreviews: [] },
    ]);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      const updated = instructions
        .filter((_, i) => i !== index)
        .map((inst, i) => ({ ...inst, stepNumber: i + 1 }));
      setInstructions(updated);
    }
  };

  const updateInstruction = (index: number, value: string) => {
    const updated = [...instructions];
    updated[index] = { ...updated[index], description: value };
    setInstructions(updated);
  };

  // Upload image to S3 using presigned URL
  const uploadImageToS3 = async (
    file: File,
    recipeId: string,
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

  // Note: Nutrition is calculated automatically by backend when creating recipe
  // Backend uses: Dictionary → Translation Cache → AI (if needed)
  // No need to call /api/nutrition/calculate separately

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipeName.trim()) {
      showToast('Vui lòng nhập tên món', 'warning');
      return;
    }

    const validIngredients = ingredients.filter(
      (ing) => ing.vietnamese.trim() && ing.amount.trim()
    );
    if (validIngredients.length === 0) {
      showToast('Vui lòng nhập ít nhất 1 nguyên liệu', 'warning');
      return;
    }

    const validInstructions = instructions.filter((inst) => inst.description.trim());
    if (validInstructions.length === 0) {
      showToast('Vui lòng nhập ít nhất 1 bước nấu', 'warning');
      return;
    }

    setLoading(true);
    setUploadProgress('Đang tạo công thức...');

    try {
      // Backend tự động:
      // 1. processIngredients(): Lookup Dictionary → Translation Cache → AI (nếu cần)
      // 2. calculateTotalNutrition(): Tính nutrition từ ingredients đã process
      // Frontend chỉ gửi vietnamese + amount
      const requestBody = {
        title: recipeName,
        description: description || undefined,
        ingredients: validIngredients.map((ing) => ({
          vietnamese: ing.vietnamese,
          amount: ing.amount,
        })),
        steps: validInstructions.map((inst, index) => ({
          stepNumber: index + 1,
          description: inst.description,
          images: [],
        })),
        images: { completed: '' },
        servings,
        cookingTime: cookTime,
        difficulty,
        source: 'manual' as const,
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
      const createResponse = await fetch(`${apiUrl}/recipes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createData.error || 'Không thể tạo món');
      }

      const recipeId = createData.recipeId || createData.recipe?.recipeId;
      if (!recipeId) {
        throw new Error('Không nhận được ID công thức');
      }

      // Step 3: Upload images if any
      let completedImageUrl = '';
      const stepImageUrls: string[][] = validInstructions.map(() => []);
      const hasImages =
        completedImageFile || validInstructions.some((inst) => inst.imageFiles.length > 0);

      if (hasImages) {
        setUploadProgress('Đang tải ảnh lên...');

        if (completedImageFile) {
          setUploadProgress('Đang tải ảnh món hoàn thành...');
          completedImageUrl = await uploadImageToS3(completedImageFile, recipeId, 'completed');
        }

        for (let i = 0; i < validInstructions.length; i++) {
          const inst = validInstructions[i];
          if (inst.imageFiles.length > 0) {
            setUploadProgress(`Đang tải ảnh bước ${i + 1}...`);
            for (let j = 0; j < inst.imageFiles.length; j++) {
              const url = await uploadImageToS3(inst.imageFiles[j], recipeId, 'step', i);
              stepImageUrls[i].push(url);
            }
          }
        }

        // Step 4: Update recipe with image URLs
        setUploadProgress('Đang cập nhật công thức...');
        const updateBody: Record<string, unknown> = {};

        if (completedImageUrl) {
          updateBody.images = { completed: completedImageUrl };
        }

        const hasStepImages = stepImageUrls.some((urls) => urls.length > 0);
        if (hasStepImages) {
          updateBody.steps = validInstructions.map((inst, index) => ({
            stepNumber: index + 1,
            description: inst.description,
            images: stepImageUrls[index],
          }));
        }

        if (Object.keys(updateBody).length > 0) {
          await fetch(`${apiUrl}/recipes/${recipeId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updateBody),
          });
        }
      }

      // Show success
      showToast('Đã tạo món thành công!', 'success');

      // Delay redirect to show toast
      setTimeout(() => router.push('/manageRecipe'), 1500);
    } catch (error) {
      showToast('Lỗi: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-[#f5f5f0] to-stone-100 pb-20 lg:pb-8">
      {/* Decorative Header Background */}
      <div className="bg-gradient-to-r from-[#203d11] to-[#2a5016] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.push('/manageRecipe')}
            className="flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors group"
          >
            <svg
              className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Quay lại
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Tạo món mới</h1>
              <p className="text-white/70 text-sm mt-1">Nhập thông tin công thức của bạn</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
        <form onSubmit={handleSubmit} className="space-y-5 pt-6">
          {/* Recipe Name & Description Card */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(32,61,17,0.08)] border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#203d11]/5 to-transparent px-6 py-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#203d11] rounded-xl flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-[#203d11]">Thông tin món ăn</h2>
                  <p className="text-xs text-stone-500">Tên và mô tả công thức</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Tên món <span className="text-[#975b1d]">*</span>
                </label>
                <input
                  type="text"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  placeholder="VD: Phở bò Hà Nội, Bún chả..."
                  className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 placeholder:text-stone-400 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Mô tả</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Giới thiệu ngắn về món ăn của bạn..."
                  className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 resize-none placeholder:text-stone-400 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Completed Image */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(32,61,17,0.08)] border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#975b1d]/5 to-transparent px-6 py-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#975b1d] rounded-xl flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
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
                </div>
                <div>
                  <h2 className="font-semibold text-[#203d11]">Ảnh món hoàn thành</h2>
                  <p className="text-xs text-stone-500">Thêm ảnh đẹp cho món ăn</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <input
                type="file"
                ref={completedImageRef}
                onChange={handleCompletedImageChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              {completedImagePreview ? (
                <div className="relative w-full h-56 rounded-xl overflow-hidden group">
                  <Image
                    src={completedImagePreview}
                    alt="Completed"
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setCompletedImageFile(null);
                        setCompletedImagePreview('');
                      }}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 font-medium text-sm"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      Xóa ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => completedImageRef.current?.click()}
                  className="w-full h-56 border-2 border-dashed border-stone-300 rounded-xl flex flex-col items-center justify-center text-stone-400 hover:border-[#975b1d] hover:text-[#975b1d] hover:bg-[#975b1d]/5 transition-all group"
                >
                  <div className="w-16 h-16 bg-stone-100 group-hover:bg-[#975b1d]/10 rounded-2xl flex items-center justify-center mb-3 transition-colors">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Thêm ảnh món hoàn thành</span>
                  <span className="text-xs text-stone-400 mt-1">JPG, PNG, WEBP (Tối đa 5MB)</span>
                </button>
              )}
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(32,61,17,0.08)] border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#203d11]/5 to-transparent px-6 py-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#203d11] rounded-xl flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-[#203d11]">Thông tin cơ bản</h2>
                  <p className="text-xs text-stone-500">Khẩu phần, thời gian và độ khó</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-stone-50 rounded-xl p-4 text-center">
                  <div className="w-10 h-10 bg-[#203d11]/10 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="w-5 h-5 text-[#203d11]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <label className="block text-xs font-medium text-stone-500 mb-2">Khẩu phần</label>
                  <input
                    type="number"
                    value={servings}
                    onChange={(e) => setServings(parseInt(e.target.value) || 1)}
                    min={1}
                    max={20}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 text-center font-medium"
                  />
                </div>
                <div className="bg-stone-50 rounded-xl p-4 text-center">
                  <div className="w-10 h-10 bg-[#975b1d]/10 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="w-5 h-5 text-[#975b1d]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <label className="block text-xs font-medium text-stone-500 mb-2">
                    Thời gian (phút)
                  </label>
                  <input
                    type="number"
                    value={cookTime}
                    onChange={(e) => setCookTime(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 text-center font-medium"
                  />
                </div>
                <div className="bg-stone-50 rounded-xl p-4 text-center">
                  <div className="w-10 h-10 bg-[#203d11]/10 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="w-5 h-5 text-[#203d11]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                  <label className="block text-xs font-medium text-stone-500 mb-2">Độ khó</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 text-center font-medium bg-white"
                  >
                    <option value="easy">Dễ</option>
                    <option value="medium">Trung bình</option>
                    <option value="hard">Khó</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(32,61,17,0.08)] border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#203d11]/5 to-transparent px-6 py-4 border-b border-stone-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#203d11] rounded-xl flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-semibold text-[#203d11]">
                      Nguyên liệu <span className="text-[#975b1d]">*</span>
                    </h2>
                    <p className="text-xs text-stone-500">{ingredients.length} nguyên liệu</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addIngredient}
                  className="px-4 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a4f16] text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Thêm
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {ingredients.map((ing, index) => (
                  <div key={index} className="flex items-center gap-3 group">
                    <div className="w-8 h-8 bg-[#203d11]/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#203d11]">{index + 1}</span>
                    </div>
                    <input
                      type="text"
                      value={ing.vietnamese}
                      onChange={(e) => updateIngredient(index, 'vietnamese', e.target.value)}
                      placeholder="Tên nguyên liệu"
                      className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 placeholder:text-stone-400 transition-all"
                    />
                    <input
                      type="text"
                      value={ing.amount}
                      onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                      placeholder="500g"
                      className="w-28 px-4 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] text-stone-900 placeholder:text-stone-400 text-center transition-all"
                    />
                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIngredient(index)}
                        className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(32,61,17,0.08)] border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#975b1d]/5 to-transparent px-6 py-4 border-b border-stone-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#975b1d] rounded-xl flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-semibold text-[#203d11]">
                      Các bước nấu <span className="text-[#975b1d]">*</span>
                    </h2>
                    <p className="text-xs text-stone-500">{instructions.length} bước</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addInstruction}
                  className="px-4 py-2 bg-[#975b1d] text-white rounded-xl hover:bg-[#7a4a17] text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Thêm bước
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-5">
                {instructions.map((inst, index) => (
                  <div key={index} className="bg-stone-50 rounded-xl p-5 group">
                    <div className="flex gap-4 mb-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-[#203d11] to-[#2a5016] text-white rounded-xl flex items-center justify-center font-bold shadow-sm">
                        {inst.stepNumber}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={inst.description}
                          onChange={(e) => updateInstruction(index, e.target.value)}
                          rows={3}
                          placeholder="Mô tả chi tiết bước nấu..."
                          className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] resize-none text-stone-900 placeholder:text-stone-400 bg-white transition-all"
                        />
                      </div>
                      {instructions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInstruction(index)}
                          className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-100 rounded-xl opacity-0 group-hover:opacity-100 transition-all self-start"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* Step Images */}
                    <div className="ml-11">
                      <div className="flex gap-2 flex-wrap">
                        {inst.imagePreviews.map((img, imgIndex) => (
                          <div
                            key={imgIndex}
                            className="relative w-20 h-20 rounded-lg overflow-hidden"
                          >
                            <Image
                              src={img}
                              alt={`Step ${inst.stepNumber}`}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeStepImage(index, imgIndex)}
                              className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
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
                        ))}
                        {inst.imageFiles.length < MAX_STEP_IMAGES && (
                          <label className="w-20 h-20 border-2 border-dashed border-stone-300 rounded-lg flex items-center justify-center text-stone-400 hover:border-[#975b1d] hover:text-[#975b1d] cursor-pointer transition">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              onChange={(e) => handleStepImageChange(index, e)}
                              className="hidden"
                            />
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
                          </label>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 mt-1">
                        {inst.imageFiles.length}/{MAX_STEP_IMAGES} ảnh
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(32,61,17,0.08)] border border-stone-100 p-6">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.push('/manageRecipe')}
                disabled={loading}
                className="flex-1 px-6 py-3.5 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] px-6 py-3.5 bg-gradient-to-r from-[#203d11] to-[#2a5016] text-white rounded-xl hover:from-[#2a4f16] hover:to-[#356019] font-medium shadow-lg shadow-[#203d11]/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>{uploadProgress || 'Đang tạo...'}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Tạo món
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 ${
              toast.type === 'success'
                ? 'bg-[#203d11] text-white'
                : toast.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-[#975b1d] text-white'
            }`}
          >
            {toast.type === 'success' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            {toast.type === 'warning' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
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
      )}
    </div>
  );
}

export default function CreateRecipePage() {
  return (
    <ProtectedRoute>
      <CreateRecipeContent />
    </ProtectedRoute>
  );
}
