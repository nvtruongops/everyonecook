'use client';

import { useState } from 'react';
import { shareRecipeToFeed } from '@/lib/api/recipes';
import Toast from '../Toast';

interface ShareRecipeModalProps {
  recipeId: string;
  recipeTitle: string;
  recipeImages?: string[];
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Share Recipe Modal
 *
 * Flow 2: Share từ Recipe Management
 * - title: Tiêu đề post (có thể khác với recipe title)
 * - Data được COPY từ recipe (không reference)
 * - Post và Recipe độc lập sau khi share
 */
export default function ShareRecipeModal({
  recipeId,
  recipeTitle,
  recipeImages = [],
  onClose,
  onSuccess,
}: ShareRecipeModalProps) {
  const [title, setTitle] = useState(''); // Custom title for post
  const [selectedImages, setSelectedImages] = useState<string[]>(recipeImages.slice(0, 3));
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleShare = async () => {
    try {
      setLoading(true);
      await shareRecipeToFeed({
        recipeId,
        title: title.trim() || undefined, // Custom title or use recipe title
        images: selectedImages.length > 0 ? selectedImages : undefined,
        privacy,
      });

      setToast({ message: 'Đã chia sẻ công thức lên feed!', type: 'success' });
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to share recipe:', error);
      setToast({ message: 'Không thể chia sẻ công thức', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleImageToggle = (imageUrl: string) => {
    setSelectedImages((prev) =>
      prev.includes(imageUrl) ? prev.filter((url) => url !== imageUrl) : [...prev, imageUrl]
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold">Share Recipe to Feed</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Info about data independence */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Lưu ý:</strong> Dữ liệu công thức sẽ được sao chép sang bài đăng. Xóa bài
                đăng không ảnh hưởng đến công thức gốc và ngược lại.
              </p>
            </div>

            {/* Custom Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tiêu đề bài đăng (tùy chọn)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Để trống sẽ dùng: "${recipeTitle}"`}
                maxLength={200}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                {title.length > 0 ? `${title.length}/200 ký tự` : `Sẽ dùng: "${recipeTitle}"`}
              </p>
            </div>

            {/* Images Selection */}
            {recipeImages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Images (optional, max 3)
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {recipeImages.map((imageUrl, index) => (
                    <div key={index} className="relative">
                      <img
                        src={imageUrl}
                        alt={`Recipe ${index + 1}`}
                        className={`w-full h-32 object-cover rounded-lg cursor-pointer border-2 ${
                          selectedImages.includes(imageUrl)
                            ? 'border-blue-500'
                            : 'border-transparent'
                        }`}
                        onClick={() => handleImageToggle(imageUrl)}
                      />
                      {selectedImages.includes(imageUrl) && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {selectedImages.length} of {recipeImages.length} images selected
                </p>
              </div>
            )}

            {/* Privacy */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quyền riêng tư</label>
              <select
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="public">Công khai - Mọi người đều thấy</option>
                <option value="friends">Bạn bè - Chỉ bạn bè thấy</option>
                <option value="private">Riêng tư - Chỉ mình tôi</option>
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              disabled={loading}
            >
              Hủy
            </button>
            <button
              onClick={handleShare}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Đang chia sẻ...' : 'Chia sẻ lên Feed'}
            </button>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
