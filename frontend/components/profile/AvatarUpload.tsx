'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import CachedAvatar from '@/components/ui/CachedAvatar';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  onUploadSuccess: (newAvatarUrl: string) => void;
}

export default function AvatarUpload({ currentAvatarUrl, onUploadSuccess }: AvatarUploadProps) {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError('File quá lớn. Tối đa 5MB');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Sai định dạng file. Vui lòng dùng JPEG, PNG hoặc WebP');
      return;
    }

    setError(null);

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    await uploadAvatar(file);
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Validate token
      if (!token) {
        throw new Error('Yêu cầu xác thực. Vui lòng đăng nhập lại.');
      }

      // Step 1: Get presigned URL
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      setProgress(10);

      const presignedResponse = await fetch(`${API_URL}/users/profile/avatar/presigned`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_type: file.type,
          file_size: file.size,
        }),
      });

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json();
        throw new Error(errorData.message || 'Không lấy được URL tải lên');
      }

      const responseData = await presignedResponse.json();
      const { upload_url, avatar_url } = responseData.data; // API wraps data in "data" field
      setProgress(30);

      // Step 2: Upload to S3
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Không tải được file lên S3');
      }

      setProgress(100);

      // Success! File uploaded to S3 and profile updated
      // Add small delay to ensure S3/CloudFront sync
      setTimeout(() => {
        // Force browser to reload the image by adding cache buster
        const cacheBustedUrl = avatar_url.includes('?')
          ? avatar_url
          : `${avatar_url.split('?')[0]}?v=${Date.now()}`;
        onUploadSuccess(cacheBustedUrl);
        setPreview(null);
        setProgress(0);
      }, 500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Tải lên thất bại. Vui lòng thử lại';
      console.error('Upload failed:', err);
      setError(errorMessage);
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center">
      {/* Avatar preview */}
      <div className="relative mb-4">
        {preview ? (
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-200">
            <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="border-4 border-gray-200 rounded-full">
            <CachedAvatar
              src={currentAvatarUrl}
              isCurrentUser={!currentAvatarUrl}
              alt={user?.fullName || user?.email || 'User avatar'}
              fallbackText={user?.fullName}
              size="2xl"
            />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <div className="text-white text-xs font-medium">{progress}%</div>
            </div>
          </div>
        )}
      </div>

      {/* Upload button */}
      <label
        className={`cursor-pointer px-4 py-2 rounded-md transition-colors ${
          uploading || !token
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {uploading ? 'Đang tải lên...' : !token ? 'Vui lòng đăng nhập' : 'Đổi ảnh đại diện'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          disabled={uploading || !token}
          className="hidden"
        />
      </label>

      {/* Progress bar */}
      {uploading && (
        <div className="w-full max-w-xs mt-3">
          <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Success message */}
      {progress === 100 && !uploading && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-600">Cập nhật ảnh đại diện thành công!</p>
        </div>
      )}

      {/* File info */}
      <p className="mt-3 text-xs text-gray-500 text-center">Tối đa 5MB • JPEG, PNG hoặc WebP</p>
    </div>
  );
}
