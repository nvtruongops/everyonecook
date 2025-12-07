'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Post } from '@/types/posts';
import {
  addReaction,
  removeReaction,
  deletePost,
  updatePost as updatePostService,
} from '@/services/posts';
import { saveRecipeFromPost } from '@/lib/api/recipes';
import ShareButton from './ShareButton';
import ReportPostModal from './ReportPostModal';
import CommentSection from './CommentSection';
import SharedPostCard from './SharedPostCard';
import CachedAvatar from '@/components/ui/CachedAvatar';
import OptimizedImage from '@/components/ui/OptimizedImage';
import { normalizeImageUrl } from '@/lib/image-utils';

interface PostCardProps {
  post: Post;
  onPostDeleted?: () => void;
  onPostUpdated?: () => void;
  priority?: boolean; // For LCP optimization - set true for first post in feed
  isDetailView?: boolean; // For post detail page - use larger images (800x800)
  highlightCommentId?: string | null; // For scrolling to specific comment from notification
}

/**
 * PostImageGallery - Simple responsive image gallery
 * - Scale theo chiều ngang (width 100%)
 * - Giữ aspect ratio cố định, không max-height phức tạp
 *
 * Layout:
 * - 1 ảnh: Full width, aspect 16:10 (or 1:1 for detail view)
 * - 2 ảnh: Grid 2 cột, aspect 4:3
 * - 3+ ảnh: Grid layout với overlay "+X"
 */
function PostImageGallery({
  images,
  priority,
  isDetailView,
}: {
  images: string[];
  priority?: boolean;
  isDetailView?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  // 1 ảnh: Full width, aspect 16:10 (or 1:1 for detail view with max 800x800)
  if (images.length === 1) {
    return (
      <div className="mb-3 rounded-lg overflow-hidden">
        <div
          className={`relative w-full cursor-pointer ${isDetailView ? 'aspect-square max-w-[800px] mx-auto' : 'aspect-[16/10]'}`}
          onClick={() => setLightboxIndex(0)}
        >
          <OptimizedImage
            src={images[0]}
            alt="Post image"
            fill
            priority={priority}
            sizes={
              isDetailView
                ? '(max-width: 800px) 100vw, 800px'
                : '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 600px'
            }
            objectFit="cover"
            className="rounded-lg"
            quality={isDetailView ? 90 : 75}
          />
        </div>
        {lightboxIndex !== null && (
          <ImageLightbox
            images={images}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </div>
    );
  }

  // 2 ảnh: Grid 2 cột, aspect 4:3
  if (images.length === 2) {
    return (
      <div className="mb-3 rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 gap-1">
          {images.map((url, index) => (
            <div
              key={index}
              className="relative aspect-[4/3] cursor-pointer"
              onClick={() => setLightboxIndex(index)}
            >
              <OptimizedImage
                src={url}
                alt={`Image ${index + 1}`}
                fill
                priority={priority && index === 0}
                sizes="(max-width: 640px) 50vw, 300px"
                objectFit="cover"
                className="rounded-lg"
              />
            </div>
          ))}
        </div>
        {lightboxIndex !== null && (
          <ImageLightbox
            images={images}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </div>
    );
  }

  // 3+ ảnh: Grid 2 cột với ảnh đầu chiếm 2 hàng
  const remainingCount = images.length - 3;

  return (
    <div className="mb-3 rounded-lg overflow-hidden">
      {showAll ? (
        // Hiển thị tất cả ảnh dạng grid
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {images.map((url, index) => (
              <div
                key={index}
                className="relative aspect-square cursor-pointer"
                onClick={() => setLightboxIndex(index)}
              >
                <OptimizedImage
                  src={url}
                  alt={`Image ${index + 1}`}
                  fill
                  priority={priority && index === 0}
                  sizes="(max-width: 640px) 50vw, 200px"
                  objectFit="cover"
                  className="rounded-lg"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAll(false)}
            className="w-full mt-1.5 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Thu gọn
          </button>
        </>
      ) : (
        // Layout: 1 ảnh lớn bên trái (aspect 3:4) + 2 ảnh nhỏ bên phải (aspect 4:3 mỗi ảnh)
        <div className="grid grid-cols-2 gap-1">
          {/* Ảnh lớn bên trái - aspect 3:4 */}
          <div className="relative aspect-[3/4] cursor-pointer" onClick={() => setLightboxIndex(0)}>
            <OptimizedImage
              src={images[0]}
              alt="Image 1"
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, 300px"
              objectFit="cover"
              className="rounded-lg"
            />
          </div>
          {/* 2 ảnh nhỏ bên phải - mỗi ảnh aspect 4:3, tổng cao = 3:4 */}
          <div className="flex flex-col gap-1">
            <div
              className="relative aspect-[4/3] cursor-pointer"
              onClick={() => setLightboxIndex(1)}
            >
              <OptimizedImage
                src={images[1]}
                alt="Image 2"
                fill
                sizes="(max-width: 640px) 50vw, 300px"
                objectFit="cover"
                className="rounded-lg"
              />
            </div>
            <div
              className="relative aspect-[4/3] cursor-pointer"
              onClick={() => setLightboxIndex(2)}
            >
              <OptimizedImage
                src={images[2]}
                alt="Image 3"
                fill
                sizes="(max-width: 640px) 50vw, 300px"
                objectFit="cover"
                className="rounded-lg"
              />
              {/* Overlay "+X" */}
              {remainingCount > 0 && (
                <div
                  className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center cursor-pointer rounded-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAll(true);
                  }}
                >
                  <span className="text-white text-xl font-bold">+{remainingCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * ImageLightbox - Modal xem ảnh full screen
 */
function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const goNext = () => setCurrentIndex((prev) => (prev + 1) % images.length);
  const goPrev = () => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full transition z-10"
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

      {/* Image counter */}
      <div className="absolute top-4 left-4 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-4 p-2 text-white hover:bg-white/20 rounded-full transition"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-4 p-2 text-white hover:bg-white/20 rounded-full transition"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Main image */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <OptimizedImage
          src={images[currentIndex]}
          alt={`Image ${currentIndex + 1}`}
          fill
          objectFit="contain"
          sizes="90vw"
          priority
        />
      </div>
    </div>
  );
}

export default function PostCard({
  post,
  onPostDeleted,
  onPostUpdated,
  priority = false,
  isDetailView = false,
  highlightCommentId = null,
}: PostCardProps) {
  const { user, token } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const [showComments, setShowComments] = useState(!!highlightCommentId);
  const [expandedRecipe, setExpandedRecipe] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [fetchedRecipeData, setFetchedRecipeData] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [saveToast, setSaveToast] = useState<'success' | 'error' | null>(null);
  const [editTitle, setEditTitle] = useState(post.content || '');
  const [editPrivacy, setEditPrivacy] = useState<'public' | 'friends' | 'private'>(
    (post.privacy as 'public' | 'friends' | 'private') || 'public'
  );

  const [localPost, setLocalPost] = useState(post);

  // Sync localPost when post ID changes (new post) but preserve optimistic updates
  // Only sync if the post ID is different (not just re-render with same post)
  useEffect(() => {
    const currentId = localPost.post_id || localPost.postId;
    const newId = post.post_id || post.postId;
    if (currentId !== newId) {
      setLocalPost(post);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.post_id, post.postId]);

  // Check if current user owns this post
  // Backend returns user_id as Cognito sub (UUID), so we check against user.sub/userId
  // Also check username as fallback for backward compatibility
  const checkOwnership = (): boolean => {
    if (!user) return false;

    // Primary check: Cognito sub (UUID) match
    if (user.sub && post.user_id && user.sub === post.user_id) return true;
    if (user.userId && post.user_id && user.userId === post.user_id) return true;

    // Fallback: username match (case-insensitive)
    if (
      user.username &&
      post.username &&
      user.username.toLowerCase() === post.username.toLowerCase()
    )
      return true;

    // Additional fallback: user_id might be username in some cases
    if (user.username && post.user_id && user.username.toLowerCase() === post.user_id.toLowerCase())
      return true;

    return false;
  };

  const isOwnPost = checkOwnership();
  const hasRecipeData = post.recipeData || post.recipe_id;

  // Format timestamp
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('vi-VN');
  };

  // Handle like/unlike
  const handleReaction = async () => {
    if (!token || reacting) return;

    setReacting(true);
    const wasLiked = !!localPost.user_reaction;

    // Optimistic update
    setLocalPost({
      ...localPost,
      user_reaction: wasLiked ? undefined : 'like',
      likes_count: wasLiked ? localPost.likes_count - 1 : localPost.likes_count + 1,
    });

    try {
      const postId = post.post_id || post.postId;
      if (wasLiked) {
        // Remove reaction
        await removeReaction(token, postId);
      } else {
        // Add reaction
        await addReaction(token, postId, 'like');
      }
    } catch (error) {
      console.error('Failed to react:', error);
      // Revert optimistic update on error
      setLocalPost({
        ...localPost,
        user_reaction: wasLiked ? 'like' : undefined,
        likes_count: wasLiked ? localPost.likes_count : localPost.likes_count - 1,
      });
    } finally {
      setReacting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!token || deleting) return;

    setDeleting(true);
    const postId = post.post_id || post.postId;
    try {
      await deletePost(token, postId);
      onPostDeleted?.();
    } catch (error) {
      console.error('Failed to delete post:', error);
      alert('Failed to delete post');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Handle save recipe from post - simplified, no custom title needed
  const handleSaveRecipe = async () => {
    if (!token || savingRecipe) return;

    setSavingRecipe(true);
    setSaveToast(null);
    const postId = post.post_id || post.postId;
    try {
      await saveRecipeFromPost(postId);
      // Show success toast
      setSaveToast('success');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (error: any) {
      console.error('Failed to save recipe:', error);
      setSaveToast('error');
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setSavingRecipe(false);
    }
  };

  // Handle edit post (title and privacy)
  const handleEditPost = async () => {
    if (!token || editing || !editTitle.trim()) return;

    setEditing(true);
    const postId = post.post_id || post.postId;
    try {
      await updatePostService(token, postId, {
        title: editTitle.trim(),
        privacyLevel: editPrivacy,
      });
      setLocalPost({
        ...localPost,
        content: editTitle.trim(),
        privacy: editPrivacy,
      });
      setShowEditModal(false);
      onPostUpdated?.();
    } catch (error: any) {
      console.error('Failed to update post:', error);
      alert(error.message || 'Không thể cập nhật bài đăng');
    } finally {
      setEditing(false);
    }
  };

  // Fetch recipe data when expanding
  const handleExpandRecipe = async () => {
    if (!expandedRecipe && post.recipe_id && !post.recipeData && !fetchedRecipeData && token) {
      // Need to fetch recipe data
      setLoadingRecipe(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
        console.log('[PostCard] Fetching recipe:', post.recipe_id);
        const response = await fetch(`${apiUrl}/recipes/${post.recipe_id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log('[PostCard] Recipe response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('[PostCard] Recipe data:', data);

          // Handle different response formats
          const recipeData = data.data?.recipe || data.data || data.recipe || data;
          setFetchedRecipeData(recipeData);
        } else {
          console.error('[PostCard] Failed to fetch recipe:', response.status);
          const error = await response.json();
          console.error('[PostCard] Error details:', error);
        }
      } catch (error) {
        console.error('[PostCard] Error fetching recipe:', error);
      } finally {
        setLoadingRecipe(false);
      }
    }
    setExpandedRecipe(!expandedRecipe);
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 ${
        isDetailView ? 'p-6 max-w-[800px] mx-auto' : 'p-4'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <Link href={`/users/${post.user_id}`} prefetch={false}>
            <CachedAvatar
              src={post.user_avatar}
              alt={post.username || 'User'}
              size="md"
              fallbackText={post.username}
              priority={priority}
            />
          </Link>

          {/* User info */}
          <div>
            <div className="flex items-center gap-1">
              <Link
                href={`/users/${post.user_id}`}
                prefetch={false}
                className="font-medium text-gray-900 hover:underline"
              >
                {post.username || 'Unknown User'}
              </Link>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>{formatTime(String(post.created_at || new Date().toISOString()))}</span>
              <span>•</span>
              {/* Privacy indicator */}
              {(() => {
                // Prioritize 'privacy' field over legacy 'is_public'
                const privacyStatus = post.privacy || (post.is_public ? 'public' : 'private');

                if (privacyStatus === 'public') {
                  return (
                    <span className="flex items-center gap-0.5" title="Công khai">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" />
                      </svg>
                      Công khai
                    </span>
                  );
                } else if (privacyStatus === 'friends') {
                  return (
                    <span className="flex items-center gap-0.5" title="Bạn bè">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                      Bạn bè
                    </span>
                  );
                } else {
                  return (
                    <span className="flex items-center gap-0.5" title="Chỉ mình tôi">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Riêng tư
                    </span>
                  );
                }
              })()}
            </div>
          </div>
        </div>

        {/* Menu (3 dots) */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                {isOwnPost ? (
                  // Owner menu: Edit (title only) + Delete
                  <>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setEditTitle(localPost.content || '');
                        setEditPrivacy(
                          (localPost.privacy as 'public' | 'friends' | 'private') || 'public'
                        );
                        setShowEditModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
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
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Chỉnh sửa tiêu đề
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
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
                      Xóa bài đăng
                    </button>
                  </>
                ) : (
                  // Other user menu: Save Recipe + Report
                  <>
                    {hasRecipeData && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          handleSaveRecipe();
                        }}
                        disabled={savingRecipe}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50"
                      >
                        {savingRecipe ? (
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                        ) : (
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
                              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                            />
                          </svg>
                        )}
                        {savingRecipe ? 'Đang lưu...' : 'Lưu công thức'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowReportModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
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
                          d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                        />
                      </svg>
                      Báo cáo
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content - Tiêu đề */}
      {post.content && <p className="text-gray-800 mb-3 whitespace-pre-wrap">{post.content}</p>}

      {/* Recipe Tag - Fetch and display when recipe_id exists but no recipeData */}
      {post.recipe_id && !post.recipeData && (
        <div className="mb-3 bg-gradient-to-br from-[#f5f0e8] to-white border-2 border-[#203d11]/20 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="font-bold text-[#203d11] text-lg flex-1">
                {fetchedRecipeData?.title || 'Công thức món ăn'}
              </h4>
            </div>

            {fetchedRecipeData && (
              <div className="flex items-center gap-4 text-sm text-[#203d11]/70 mb-3">
                <div className="flex items-center gap-1">
                  <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">NL</span>
                  <span>{fetchedRecipeData.ingredients?.length || 0} nguyên liệu</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">B</span>
                  <span>{fetchedRecipeData.instructions?.length || 0} bước</span>
                </div>
                {fetchedRecipeData.prep_time_minutes && (
                  <div className="flex items-center gap-1">
                    <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">T</span>
                    <span>{fetchedRecipeData.prep_time_minutes} phút</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleExpandRecipe}
              disabled={loadingRecipe}
              className="w-full py-2.5 px-4 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-all font-medium text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              {loadingRecipe ? (
                <>
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
                  Đang tải...
                </>
              ) : expandedRecipe ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                  Thu gọn công thức
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  Xem chi tiết công thức
                </>
              )}
            </button>
          </div>

          {/* Expanded - Show full recipe data */}
          {expandedRecipe && fetchedRecipeData && (
            <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top duration-300">
              {/* Ingredients */}
              <div>
                <h5 className="text-md font-semibold text-[#203d11] mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-[#203d11] text-white rounded-lg text-xs flex items-center justify-center font-bold">NL</span>
                  Nguyên liệu
                </h5>
                <div className="bg-white rounded-xl p-3 space-y-1.5 border border-[#203d11]/10">
                  {fetchedRecipeData.ingredients?.map((ing: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-[#975b1d] mt-0.5">•</span>
                      <span className="text-[#203d11]/80">
                        <span className="font-medium text-[#203d11]">{ing.ingredient_name || ing.name}</span>
                        {ing.quantity && (
                          <span className="text-[#203d11]/60">
                            {' '}
                            - {ing.quantity} {ing.unit || ''}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div>
                <h5 className="text-md font-semibold text-[#203d11] mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-[#975b1d] text-white rounded-lg text-xs flex items-center justify-center font-bold">CL</span>
                  Cách làm
                </h5>
                <div className="space-y-3">
                  {fetchedRecipeData.instructions?.map((step: any, idx: number) => (
                    <div key={idx} className="flex gap-2.5">
                      <div className="flex-shrink-0 w-6 h-6 bg-[#203d11] text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {step.step_number || idx + 1}
                      </div>
                      <p className="text-sm text-[#203d11]/80 flex-1 pt-0.5">{step.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recipe Data - Hiển thị công thức nấu ăn với expand/collapse */}
      {post.recipeData && (
        <div className="mb-3 bg-gradient-to-br from-[#f5f0e8] to-white border-2 border-[#203d11]/20 rounded-xl shadow-sm overflow-hidden transition-all duration-300">
          {/* Recipe Header - Always visible */}
          <div className="p-4">
            {/* Completed dish image */}
            {post.recipeData.images?.completed && (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-3">
                <OptimizedImage
                  src={normalizeImageUrl(post.recipeData.images.completed) || ''}
                  alt={post.recipeData.title}
                  fill
                  objectFit="cover"
                  className="rounded-lg"
                />
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <h4 className="font-bold text-[#203d11] text-lg flex-1">{post.recipeData.title}</h4>
            </div>

            {/* Show original author attribution for recipes saved from social */}
            {post.recipeAttribution?.originalAuthorUsername && (
              <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Công thức gốc từ{' '}
                  <span className="font-medium text-[#975b1d]">
                    @{post.recipeAttribution.originalAuthorUsername}
                  </span>
                </span>
              </div>
            )}

            {post.recipeData.description && (
              <p className="text-sm text-gray-600 mb-3">{post.recipeData.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm text-[#203d11]/70 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">NL</span>
                <span>{post.recipeData.ingredients?.length || 0} nguyên liệu</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">B</span>
                <span>
                  {post.recipeData.steps?.length || post.recipeData.instructions?.length || 0} bước
                </span>
              </div>
              {post.recipeData.cookingTime && (
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">T</span>
                  <span>{post.recipeData.cookingTime} phút</span>
                </div>
              )}
              {post.recipeData.servings && (
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 bg-[#203d11]/10 rounded text-xs flex items-center justify-center font-medium text-[#203d11]">P</span>
                  <span>{post.recipeData.servings} người</span>
                </div>
              )}
              {post.recipeData.difficulty && (
                <div className="flex items-center gap-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      post.recipeData.difficulty === 'easy'
                        ? 'bg-[#203d11]/10 text-[#203d11]'
                        : post.recipeData.difficulty === 'medium'
                          ? 'bg-[#975b1d]/10 text-[#975b1d]'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {post.recipeData.difficulty === 'easy'
                      ? 'Dễ'
                      : post.recipeData.difficulty === 'medium'
                        ? 'Trung bình'
                        : 'Khó'}
                  </span>
                </div>
              )}
            </div>

            {/* Toggle Button */}
            <button
              onClick={() => setExpandedRecipe(!expandedRecipe)}
              className="w-full py-2.5 px-4 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-all font-medium text-sm flex items-center justify-center gap-2 shadow-md"
            >
              {expandedRecipe ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                  Thu gọn công thức
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  Xem chi tiết công thức
                </>
              )}
            </button>
          </div>

          {/* Expanded Recipe Details */}
          {expandedRecipe && (
            <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top duration-300">
              {/* Nutrition Info */}
              {post.recipeData.nutrition && (
                <div className="bg-white rounded-xl p-3 border border-[#203d11]/10">
                  <h5 className="text-sm font-semibold text-[#203d11] mb-2">
                    Thông tin dinh dưỡng (mỗi phần)
                  </h5>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-[#f5f0e8] rounded-lg p-2">
                      <div className="font-bold text-[#203d11]">
                        {post.recipeData.nutrition.calories || 0}
                      </div>
                      <div className="text-[#203d11]/60">Calo</div>
                    </div>
                    <div className="bg-[#f5f0e8] rounded-lg p-2">
                      <div className="font-bold text-[#203d11]">
                        {post.recipeData.nutrition.protein || 0}g
                      </div>
                      <div className="text-[#203d11]/60">Protein</div>
                    </div>
                    <div className="bg-[#f5f0e8] rounded-lg p-2">
                      <div className="font-bold text-[#203d11]">
                        {post.recipeData.nutrition.carbs || 0}g
                      </div>
                      <div className="text-[#203d11]/60">Carbs</div>
                    </div>
                    <div className="bg-[#f5f0e8] rounded-lg p-2">
                      <div className="font-bold text-[#975b1d]">
                        {post.recipeData.nutrition.fat || 0}g
                      </div>
                      <div className="text-[#203d11]/60">Fat</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Ingredients */}
              <div>
                <h5 className="text-md font-semibold text-[#203d11] mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-[#203d11] text-white rounded-lg text-xs flex items-center justify-center font-bold">NL</span>
                  Nguyên liệu
                </h5>
                <div className="bg-white rounded-xl p-3 space-y-1.5 border border-[#203d11]/10">
                  {post.recipeData.ingredients?.map((ing: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-[#975b1d] mt-0.5">•</span>
                      <span className="text-[#203d11]/80">
                        <span className="font-medium text-[#203d11]">
                          {ing.vietnamese || ing.name || ing.ingredient_name}
                        </span>
                        {(ing.amount || ing.quantity) && (
                          <span className="text-[#203d11]/60"> - {ing.amount || ing.quantity}</span>
                        )}
                        {ing.notes && <span className="text-[#203d11]/50 italic"> ({ing.notes})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Steps/Instructions */}
              <div>
                <h5 className="text-md font-semibold text-[#203d11] mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-[#975b1d] text-white rounded-lg text-xs flex items-center justify-center font-bold">CL</span>
                  Cách làm
                </h5>
                <div className="space-y-4">
                  {(post.recipeData.steps || post.recipeData.instructions)?.map(
                    (step: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-xl p-3 border border-[#203d11]/10">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-7 h-7 bg-[#203d11] text-white rounded-full flex items-center justify-center text-sm font-bold">
                            {step.stepNumber || step.step_number || idx + 1}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-[#203d11]/80">
                              {step.description || step.instruction}
                            </p>
                            {step.duration && (
                              <p className="text-xs text-[#975b1d] mt-1">{step.duration} phút</p>
                            )}
                          </div>
                        </div>
                        {/* Step images */}
                        {step.images && step.images.length > 0 && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {step.images.map((img: string, imgIdx: number) => (
                              <div
                                key={imgIdx}
                                className="relative aspect-square rounded-lg overflow-hidden"
                              >
                                <OptimizedImage
                                  src={img}
                                  alt={`Bước ${step.stepNumber || idx + 1} - Ảnh ${imgIdx + 1}`}
                                  fill
                                  objectFit="cover"
                                  className="rounded-lg"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Images - Ảnh post */}
      {post.images && post.images.length > 0 && (
        <PostImageGallery images={post.images} priority={priority} isDetailView={isDetailView} />
      )}

      {/* Shared Post - Hiển thị bài viết được chia sẻ (like Facebook) */}
      {post.postType === 'shared' && post.sharedPost && (
        <div className="mb-3">
          <SharedPostCard sharedPost={post.sharedPost} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-3 border-t border-gray-200">
        {/* Like */}
        <button
          onClick={handleReaction}
          disabled={reacting}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition ${
            localPost.user_reaction
              ? 'text-red-600 bg-red-50 hover:bg-red-100'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <svg
            className="w-5 h-5"
            fill={localPost.user_reaction ? 'currentColor' : 'none'}
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span className="text-sm font-medium">{localPost.likes_count}</span>
        </button>

        {/* Comment */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="text-sm font-medium">{localPost.comments_count}</span>
        </button>

        {/* Share - Only show for other users' posts and non-shared posts (like Facebook) */}
        {!isOwnPost && post.postType !== 'shared' && (
          <ShareButton
            postId={String(post.post_id || post.postId || '')}
            onShared={onPostUpdated}
            shareCount={localPost.shares_count || 0}
          />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-red-600"
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
            </div>

            {/* Content */}
            <h3 className="text-xl font-semibold text-center mb-2 text-gray-900">Xóa bài viết?</h3>
            <p className="text-gray-600 text-center mb-6 text-sm">
              Bạn có chắc chắn muốn xóa bài viết này không? Thao tác này không thể hoàn tác.
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Đang xóa...
                  </span>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {showEditModal && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4 text-gray-900">Chỉnh sửa bài đăng</h3>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#203d11] mb-2">Tiêu đề</label>
              <textarea
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Nhập tiêu đề mới..."
                className="w-full px-3 py-2 border-2 border-transparent bg-[#f5f0e8]/50 rounded-xl focus:outline-none focus:border-[#975b1d] resize-none text-[#203d11]"
                rows={3}
                maxLength={500}
              />
              <div className="text-right text-xs text-[#203d11]/50 mt-1">{editTitle.length}/500</div>
            </div>

            {/* Privacy Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#203d11] mb-2">Ai có thể xem?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditPrivacy('public')}
                  className={`flex-1 px-3 py-2 text-sm rounded-xl border-2 transition ${
                    editPrivacy === 'public'
                      ? 'bg-[#203d11]/10 border-[#203d11] text-[#203d11]'
                      : 'border-[#203d11]/20 text-[#203d11]/60 hover:bg-[#f5f0e8]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-medium">P</span>
                    Công khai
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPrivacy('friends')}
                  className={`flex-1 px-3 py-2 text-sm rounded-xl border-2 transition ${
                    editPrivacy === 'friends'
                      ? 'bg-[#975b1d]/10 border-[#975b1d] text-[#975b1d]'
                      : 'border-[#203d11]/20 text-[#203d11]/60 hover:bg-[#f5f0e8]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-medium">F</span>
                    Bạn bè
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPrivacy('private')}
                  className={`flex-1 px-3 py-2 text-sm rounded-xl border-2 transition ${
                    editPrivacy === 'private'
                      ? 'bg-[#203d11]/10 border-[#203d11] text-[#203d11]'
                      : 'border-[#203d11]/20 text-[#203d11]/60 hover:bg-[#f5f0e8]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-medium">R</span>
                    Riêng tư
                  </div>
                </button>
              </div>
            </div>

            <p className="text-xs text-[#203d11]/50 mb-4">
              Lưu ý: Ảnh và nội dung công thức không thể thay đổi sau khi đăng.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={editing}
                className="flex-1 px-4 py-2.5 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] transition font-medium disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleEditPost}
                disabled={editing || !editTitle.trim()}
                className="flex-1 px-4 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editing ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Recipe Toast */}
      {saveToast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom duration-300 ${
            saveToast === 'success' ? 'bg-[#203d11] text-white' : 'bg-red-600 text-white'
          }`}
        >
          {saveToast === 'success' ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm font-medium">Đã lưu vào Quản lý món ăn!</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="text-sm font-medium">Không thể lưu công thức</span>
            </>
          )}
        </div>
      )}

      {/* Comments Section */}
      {showComments && (
        <CommentSection
          postId={localPost.post_id || localPost.postId}
          onCommentCountChange={(count) => {
            setLocalPost((prev) => ({ ...prev, comments_count: count }));
          }}
          highlightCommentId={highlightCommentId}
        />
      )}

      {/* Report Post Modal */}
      <ReportPostModal
        postId={post.post_id || post.postId}
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
      />
    </div>
  );
}
