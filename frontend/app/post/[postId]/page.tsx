'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getPostById } from '@/lib/api/posts';
import type { Post } from '@/types/posts';
import PostCard from '@/components/posts/PostCard';
import { BottomNav } from '@/components/mobile/MobileComponents';
import ProtectedRoute from '@/components/ProtectedRoute';

function PostDetailInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const postId = params?.postId as string;
  const commentId = searchParams?.get('commentId') || null;
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (postId) loadPost();
  }, [postId]);

  const loadPost = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getPostById(postId);
      if (res.success && res.data) setPost(res.data);
      else throw new Error(res.error?.message || 'Không tìm thấy bài viết');
    } catch (err: any) {
      if (err.message?.includes('không có quyền') || err.message?.includes('POST_NOT_ACCESSIBLE'))
        setError('Bài viết không tồn tại hoặc bạn không có quyền xem.');
      else setError(err.message || 'Không thể tải bài viết');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white pb-20 lg:pb-8">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#203d11] rounded-xl border-2 border-[#203d11]/20 hover:border-[#203d11]/40 hover:bg-[#f5f0e8] transition-all duration-200 font-medium shadow-sm"
          >
            <span>←</span>
            <span>Quay lại</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-[#203d11]/5">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#203d11]/20 border-t-[#203d11] mx-auto mb-4" />
            <p className="text-[#203d11]/70">Đang tải bài viết...</p>
          </div>
        )}

        {/* Not Found State */}
        {!loading && !post && !error && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-[#203d11]/5">
            <h3 className="text-xl font-bold text-[#203d11] mb-3">Không tìm thấy bài viết</h3>
            <p className="text-[#203d11]/70 mb-6">
              Bài viết này có thể đã bị xóa hoặc bạn không có quyền xem.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-all font-medium"
            >
              Về trang chủ
            </button>
          </div>
        )}

        {/* Post Content */}
        {!loading && post && (
          <div className="max-w-3xl mx-auto">
            <PostCard
              post={post}
              onPostDeleted={() => router.push('/dashboard')}
              onPostUpdated={loadPost}
              priority={true}
              isDetailView={true}
              highlightCommentId={commentId}
            />
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function PostDetailContent() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-[#203d11]/20 border-t-[#203d11]" />
        </div>
      }
    >
      <PostDetailInner />
    </Suspense>
  );
}

export default function PostDetailPage() {
  return (
    <ProtectedRoute>
      <PostDetailContent />
    </ProtectedRoute>
  );
}
