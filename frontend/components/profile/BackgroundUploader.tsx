'use client';

import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { backgroundService } from '@/services/backgroundService';

interface BackgroundUploaderProps {
  currentBackground?: string;
  onUploadSuccess: (url: string) => void;
  onUploadError: (error: string) => void;
  className?: string;
}

interface ImagePreview {
  src: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  // Original image dimensions for offset clamping
  imgWidth: number;
  imgHeight: number;
}

export default function BackgroundUploader({
  currentBackground,
  onUploadSuccess,
  onUploadError,
  className = '',
}: BackgroundUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) {
      return 'Vui lòng chọn file ảnh';
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return 'Kích thước ảnh phải nhỏ hơn 5MB';
    }

    return null;
  };

  const createImagePreview = (file: File): Promise<ImagePreview> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculate initial scale to fit image in 16:9 aspect ratio (1200x675)
          const containerWidth = 1200;
          const containerHeight = 675;
          const imgAspect = img.width / img.height;
          const containerAspect = containerWidth / containerHeight;

          let scale = 1;
          if (imgAspect > containerAspect) {
            // Image is wider, scale by height
            scale = containerHeight / img.height;
          } else {
            // Image is taller, scale by width
            scale = containerWidth / img.width;
          }

          resolve({
            src: e.target?.result as string,
            scale: Math.max(scale, 1), // Ensure at least 1x scale
            offsetX: 0,
            offsetY: 0,
            imgWidth: img.width,
            imgHeight: img.height,
          });
        };
        img.onerror = () => reject(new Error('Không tải được ảnh'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Không đọc được file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    const validation = validateFile(file);
    if (validation) {
      onUploadError(validation);
      return;
    }

    try {
      const imagePreview = await createImagePreview(file);
      setPreview(imagePreview);
      setIsAdjusting(true);
    } catch (error) {
      onUploadError(error instanceof Error ? error.message : 'Failed to load image');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const uploadFile = async (file: File) => {
    if (!token) {
      onUploadError('Yêu cầu xác thực');
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      setProgress(30);
      const backgroundUrl = await backgroundService.uploadBackground(file, token);
      setProgress(100);

      setTimeout(() => {
        onUploadSuccess(backgroundUrl);
        setProgress(0);
        setPreview(null);
        setIsAdjusting(false);
      }, 500);
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      // Check if it's a rate limit error
      if (errorMessage.includes('Rate limit exceeded') || errorMessage.includes('Maximum')) {
        onUploadError(
          'Đã đạt giới hạn tải lên (10 lần/ngày). Vui lòng thử lại vào ngày mai hoặc liên hệ hỗ trợ.'
        );
      } else {
        onUploadError(errorMessage);
      }
      setProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!preview || !canvasRef.current) return;

    // Create canvas with cropped image
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Output dimensions (16:9 aspect ratio)
      const outputWidth = 1200;
      const outputHeight = 675;

      canvas.width = outputWidth;
      canvas.height = outputHeight;

      // Clear canvas and fill with white background first
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      // Use cached dimensions for consistent calculations
      const scaledImgWidth = preview.imgWidth * preview.scale;
      const scaledImgHeight = preview.imgHeight * preview.scale;

      // Calculate where the image should be drawn on canvas
      // The offset is in screen pixels, representing how much the image center moved
      const imgDrawX = (outputWidth - scaledImgWidth) / 2 + preview.offsetX;
      const imgDrawY = (outputHeight - scaledImgHeight) / 2 + preview.offsetY;

      // Draw the scaled image at the calculated position
      ctx.drawImage(
        img,
        0,
        0,
        img.width,
        img.height, // Source: full image
        imgDrawX,
        imgDrawY,
        scaledImgWidth,
        scaledImgHeight // Destination: scaled and positioned
      );

      // Convert to blob and upload
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            onUploadError('Không xử lý được ảnh');
            return;
          }

          const file = new File([blob], 'background.jpg', { type: 'image/jpeg' });
          await uploadFile(file);
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => {
      onUploadError('Không tải được ảnh để xử lý');
    };
    img.src = preview.src;
  };

  const handleScaleChange = (newScale: number) => {
    if (!preview) return;
    setPreview({ ...preview, scale: Math.max(1, Math.min(newScale, 3)) });
  };

  // Handle drag to reposition image
  const handleImageDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!preview || !previewContainerRef.current) return;
      e.preventDefault();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // Get container dimensions for scaling
      const rect = previewContainerRef.current.getBoundingClientRect();
      const scaleX = 1200 / rect.width;
      const scaleY = 675 / rect.height;

      setIsDraggingImage(true);
      setDragStart({
        x: clientX - preview.offsetX / scaleX,
        y: clientY - preview.offsetY / scaleY,
      });
    },
    [preview]
  );

  const handleImageDragMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDraggingImage || !dragStart || !preview || !previewContainerRef.current) return;
      e.preventDefault();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // Get container dimensions for scaling screen pixels to canvas pixels
      const rect = previewContainerRef.current.getBoundingClientRect();
      const scaleX = 1200 / rect.width;
      const scaleY = 675 / rect.height;

      // Convert screen delta to canvas coordinates
      let newOffsetX = (clientX - dragStart.x) * scaleX;
      let newOffsetY = (clientY - dragStart.y) * scaleY;

      // Clamp offset to prevent black edges
      const scaledWidth = preview.imgWidth * preview.scale;
      const scaledHeight = preview.imgHeight * preview.scale;

      // Max offset ensures image always covers the 1200x675 canvas
      const maxOffsetX = Math.max(0, (scaledWidth - 1200) / 2);
      const maxOffsetY = Math.max(0, (scaledHeight - 675) / 2);

      // Clamp offsets to valid range
      newOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newOffsetX));
      newOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newOffsetY));

      setPreview({
        ...preview,
        offsetX: newOffsetX,
        offsetY: newOffsetY,
      });
    },
    [isDraggingImage, dragStart, preview]
  );

  const handleImageDragEnd = useCallback(() => {
    setIsDraggingImage(false);
    setDragStart(null);
  }, []);

  const handleResetPosition = () => {
    if (!preview) return;
    setPreview({ ...preview, offsetX: 0, offsetY: 0 });
  };

  // Adjustment mode UI
  if (isAdjusting && preview) {
    return (
      <div className={`mt-4 ${className}`}>
        <div className="bg-white rounded-xl border-2 border-emerald-500 shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">Điều chỉnh ảnh nền</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              1200 x 675 px
            </span>
          </div>

          {/* Preview Container (16:9 aspect ratio) - Draggable */}
          <div
            ref={previewContainerRef}
            className={`relative w-full bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden mb-4 shadow-inner select-none ${
              isDraggingImage ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ aspectRatio: '16/9' }}
            onMouseDown={handleImageDragStart}
            onMouseMove={handleImageDragMove}
            onMouseUp={handleImageDragEnd}
            onMouseLeave={handleImageDragEnd}
            onTouchStart={handleImageDragStart}
            onTouchMove={handleImageDragMove}
            onTouchEnd={handleImageDragEnd}
          >
            {/* Image positioned to match canvas output exactly */}
            <img
              src={preview.src}
              alt="Preview"
              className="absolute pointer-events-none"
              style={{
                // Calculate position to match canvas drawing logic
                width: `${((preview.imgWidth * preview.scale) / 1200) * 100}%`,
                height: `${((preview.imgHeight * preview.scale) / 675) * 100}%`,
                left: `${50 + (preview.offsetX / 1200) * 100}%`,
                top: `${50 + (preview.offsetY / 675) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
              draggable={false}
            />
            {/* Grid overlay with better visibility */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 border-4 border-emerald-500/40 rounded-xl"></div>
              <div className="absolute top-1/3 left-0 right-0 border-t-2 border-emerald-400/30"></div>
              <div className="absolute top-2/3 left-0 right-0 border-t-2 border-emerald-400/30"></div>
              <div className="absolute left-1/3 top-0 bottom-0 border-l-2 border-emerald-400/30"></div>
              <div className="absolute left-2/3 top-0 bottom-0 border-l-2 border-emerald-400/30"></div>
            </div>
            {/* Corner indicators */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white/80"></div>
            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white/80"></div>
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white/80"></div>
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white/80"></div>
            {/* Drag hint */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
              Kéo để định vị lại
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-5">
            {/* Zoom Control */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                    />
                  </svg>
                  Zoom
                </label>
                <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  {preview.scale.toFixed(1)}x
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleScaleChange(preview.scale - 0.1)}
                  disabled={preview.scale <= 1}
                  className="p-2 text-gray-700 hover:bg-white hover:shadow-sm rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Zoom out"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 12H4"
                    />
                  </svg>
                </button>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={preview.scale}
                  onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${((preview.scale - 1) / 2) * 100}%, #d1d5db ${((preview.scale - 1) / 2) * 100}%, #d1d5db 100%)`,
                  }}
                />
                <button
                  onClick={() => handleScaleChange(preview.scale + 0.1)}
                  disabled={preview.scale >= 3}
                  className="p-2 text-gray-700 hover:bg-white hover:shadow-sm rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Zoom in"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Reset Position Button */}
            {(preview.offsetX !== 0 || preview.offsetY !== 0) && (
              <button
                onClick={handleResetPosition}
                className="w-full p-3 text-gray-700 bg-gray-50 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Đặt lại vị trí
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => {
                setPreview(null);
                setIsAdjusting(false);
              }}
              disabled={isUploading}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmUpload}
              disabled={isUploading}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 transition shadow-sm hover:shadow-md disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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
                  Đang tải lên...
                </span>
              ) : (
                'Tải lên'
              )}
            </button>
          </div>

          {/* Progress bar */}
          {isUploading && progress > 0 && (
            <div className="w-full mt-4">
              <div className="bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full transition-all duration-300 flex items-center justify-end pr-2"
                  style={{ width: `${progress}%` }}
                >
                  {progress > 20 && (
                    <span className="text-xs font-bold text-white">{progress}%</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Normal upload mode UI
  return (
    <div className={`mt-4 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Drag & Drop Zone */}
      <div
        ref={dragZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50 scale-[1.02] shadow-lg'
            : 'border-gray-300 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/30'
        }`}
      >
        <div
          className={`transition-transform duration-200 ${isDragging ? 'scale-110' : 'scale-100'}`}
        >
          <svg
            className={`w-16 h-16 mx-auto mb-4 transition-colors ${isDragging ? 'text-emerald-500' : 'text-gray-400'}`}
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
          <p className="text-base font-semibold text-gray-900 mb-2">
            {isDragging ? 'Thả ảnh vào đây' : 'Kéo và thả ảnh nền của bạn'}
          </p>
          <p className="text-sm text-gray-500 mb-4">hoặc</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !token}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 transition shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Chọn tập tin
          </button>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                  clipRule="evenodd"
                />
              </svg>
              Tối đa 5MB
            </span>
            <span className="text-gray-300">•</span>
            <span>PNG, JPG, WebP</span>
          </div>
        </div>
      </div>

      {/* Info text when background exists */}
      {currentBackground && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          Tải lên ảnh mới để thay thế ảnh nền hiện tại
        </p>
      )}

      {/* Rate limit info */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">Giới hạn tải lên</p>
            <ul className="space-y-0.5 text-blue-700">
              <li>• Ảnh nền: 10 lần tải lên mỗi ngày</li>
              <li>• Ảnh đại diện: 10 lần tải lên mỗi ngày</li>
              <li>• Giới hạn được đặt lại hàng ngày lúc nửa đêm UTC</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
