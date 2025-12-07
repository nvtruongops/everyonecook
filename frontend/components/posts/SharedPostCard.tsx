/**
 * SharedPostCard Component
 * Displays the original post inside a shared post (like Facebook)
 *
 * Features:
 * - Shows original post content with author info
 * - Link to view original post
 * - Shows "Post không khả dụng" if original is deleted
 * - Displays recipe data if original was a recipe share
 */

'use client';

import Link from 'next/link';
import { SharedPostReference, Recipe } from '@/types/posts';
import CachedAvatar from '@/components/ui/CachedAvatar';
import OptimizedImage from '@/components/ui/OptimizedImage';
import { normalizeImageUrl } from '@/lib/image-utils';

interface SharedPostCardProps {
  sharedPost: SharedPostReference;
}

export default function SharedPostCard({ sharedPost }: SharedPostCardProps) {
  const { originalPost, originalAuthorUsername, originalAuthorAvatar, originalPostId } = sharedPost;

  // Original post was deleted
  if (!originalPost || originalPost.isDeleted) {
    return (
      <div className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-600">Bài viết không khả dụng</p>
            <p className="text-sm text-gray-400">Bài viết này đã bị xóa hoặc không còn tồn tại</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    post_id,
    user_id,
    username,
    user_avatar,
    title,
    content,
    caption,
    images,
    postType,
    recipeData,
    likes_count,
    comments_count,
    created_at,
  } = originalPost;

  // Format timestamp
  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white hover:border-gray-300 transition">
      {/* Header with link to original post */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href={`/users/${user_id || sharedPost.originalAuthorId}`} prefetch={false}>
              <CachedAvatar
                src={user_avatar || originalAuthorAvatar}
                alt={username || originalAuthorUsername || 'User'}
                size="sm"
                fallbackText={username || originalAuthorUsername}
              />
            </Link>
            <div>
              <Link
                href={`/users/${user_id || sharedPost.originalAuthorId}`}
                prefetch={false}
                className="font-medium text-gray-900 hover:underline text-sm"
              >
                {username || originalAuthorUsername || 'Unknown User'}
              </Link>
              <p className="text-xs text-gray-500">{formatTime(created_at)}</p>
            </div>
          </div>
          {/* Link to original post */}
          <Link
            href={`/post/${post_id || originalPostId}`}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[#975b1d] hover:text-[#203d11] hover:bg-[#f5f0e8] rounded-lg transition"
            title="Xem bài viết gốc"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Xem gốc
          </Link>
        </div>
      </div>

      {/* Content */}
      <Link href={`/post/${post_id || originalPostId}`} className="block">
        <div className="p-3">
          {/* Title/Content */}
          {(title || content) && (
            <p className="text-gray-800 text-sm mb-2 line-clamp-3">{title || content}</p>
          )}
          {caption && caption !== title && (
            <p className="text-gray-600 text-sm mb-2 line-clamp-2">{caption}</p>
          )}

          {/* Recipe Data Preview */}
          {postType === 'recipe_share' && recipeData && (
            <div className="bg-gradient-to-br from-[#f5f0e8] to-white border border-[#203d11]/20 rounded-lg p-3 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-[#203d11] text-sm">{recipeData.title}</h4>
              </div>
              {recipeData.images?.completed && (
                <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                  <OptimizedImage
                    src={normalizeImageUrl(recipeData.images.completed) || ''}
                    alt={recipeData.title || 'Recipe'}
                    fill
                    objectFit="cover"
                    className="rounded-lg"
                  />
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                {recipeData.ingredients && <span>{recipeData.ingredients.length} nguyên liệu</span>}
                {recipeData.cookingTime && <span>{recipeData.cookingTime} phút</span>}
                {recipeData.difficulty && (
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      recipeData.difficulty === 'easy'
                        ? 'bg-green-100 text-green-700'
                        : recipeData.difficulty === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {recipeData.difficulty === 'easy'
                      ? 'Dễ'
                      : recipeData.difficulty === 'medium'
                        ? 'TB'
                        : 'Khó'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Images (for quick posts) */}
          {postType !== 'recipe_share' && images && images.length > 0 && (
            <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {images.slice(0, 4).map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden">
                  <OptimizedImage
                    src={img}
                    alt={`Image ${idx + 1}`}
                    fill
                    objectFit="cover"
                    className="rounded-lg"
                  />
                  {idx === 3 && images.length > 4 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold">+{images.length - 4}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with engagement stats */}
        <div className="px-3 pb-3 flex items-center gap-4 text-xs text-gray-500">
          {likes_count !== undefined && likes_count > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              {likes_count}
            </span>
          )}
          {comments_count !== undefined && comments_count > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              {comments_count}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
