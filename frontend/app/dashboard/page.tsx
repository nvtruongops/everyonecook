'use client';
import { useState, useEffect, useRef, lazy, Suspense, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getFeed, PostStats } from '@/services/posts';
import { usePostsStatsPolling } from '@/hooks/usePostsStatsPolling';
import {
  getAllTrending,
  trackSearch,
  SearchTrendingItem,
  PostTrendingItem,
} from '@/services/trending';
import { Post } from '@/types/posts';
import ProtectedRoute from '@/components/ProtectedRoute';
import { normalizeImageUrl } from '@/lib/image-utils';
import { BottomNav } from '@/components/mobile/MobileComponents';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { usePostAvatarsPreload } from '@/hooks/useAvatarPreload';

const CreatePostForm = lazy(() => import('@/components/posts/CreatePostForm'));
const PostCard = lazy(() => import('@/components/posts/PostCard'));

type SortOption = 'newest' | 'oldest' | 'most_liked';
type TrendingTab = 'searches' | 'posts';

interface SearchSectionProps {
  onSearch: (q: string) => void;
  onClear: () => void;
  searchQuery: string;
  resultCount: number;
  hasSearched: boolean;
  sortBy: SortOption;
  onSortChange: (s: SortOption) => void;
}

function SearchSection({
  onSearch,
  onClear,
  searchQuery: activeQuery,
  resultCount,
  hasSearched,
  sortBy,
  onSortChange,
}: SearchSectionProps) {
  const router = useRouter();
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState(activeQuery);
  const handleSearch = async () => {
    if (searchQuery.trim() && token) {
      trackSearch(token, searchQuery.trim()).catch(() => {});
      onSearch(searchQuery.trim().toLowerCase());
    }
  };
  const handleClear = () => {
    setSearchQuery('');
    onClear();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 p-6 mb-6">
      <h2 className="text-lg font-bold text-[#203d11] mb-4">Tìm món ăn</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tìm theo tên món hoặc nguyên liệu (vd: lá dứa, bột bắp)..."
          className="flex-1 px-4 h-12 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-sm focus:outline-none focus:border-[#975b1d] text-[#203d11]"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="px-3 h-12 bg-[#f5f0e8]/50 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] transition"
            title="Xóa"
          >
            ✕
          </button>
        )}
        <button
          onClick={handleSearch}
          disabled={!searchQuery.trim()}
          className="px-4 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition disabled:opacity-50 font-semibold"
        >
          Tìm
        </button>
      </div>
      <p className="text-xs text-[#203d11]/50 mt-2">Tìm theo tên món ăn hoặc nguyên liệu, dùng dấu phẩy để tìm nhiều từ khóa</p>
      {hasSearched && resultCount > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-[#203d11]/60">Sắp xếp:</span>
          <div className="flex gap-1">
            {(['newest', 'oldest', 'most_liked'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onSortChange(s)}
                className={`px-3 py-1.5 text-xs rounded-lg transition ${sortBy === s ? 'bg-[#203d11]/10 text-[#203d11] font-semibold' : 'bg-[#f5f0e8]/50 text-[#203d11]/70 hover:bg-[#f5f0e8]'}`}
              >
                {s === 'newest' ? 'Mới nhất' : s === 'oldest' ? 'Cũ nhất' : 'Nhiều like'}
              </button>
            ))}
          </div>
        </div>
      )}
      {hasSearched && resultCount === 0 && (
        <div className="mt-4 p-4 bg-[#f5f0e8]/50 border border-[#203d11]/10 rounded-xl">
          <p className="text-sm text-[#203d11]/70 mb-3">
            Không tìm thấy kết quả cho "{activeQuery}". Thử tìm với AI.
          </p>
          <button
            onClick={() => router.push(`/cooking?ingredient=${encodeURIComponent(activeQuery)}`)}
            className="w-full px-4 py-2.5 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition text-sm font-semibold"
          >
            Tìm món với AI
          </button>
        </div>
      )}
    </div>
  );
}

function TrendingSection() {
  const router = useRouter();
  const { token } = useAuth();
  const [tab, setTab] = useState<TrendingTab>('searches');
  const [topSearches, setTopSearches] = useState<SearchTrendingItem[]>([]);
  const [topPosts, setTopPosts] = useState<PostTrendingItem[]>([]);
  const [weekId, setWeekId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTrending = async (isPolling = false) => {
    if (!token) return;
    if (!isPolling) setLoading(true);
    try {
      const r = await getAllTrending(token, 5);
      setTopSearches(r.topSearches);
      setTopPosts(r.topPosts);
      setWeekId(r.weekId);
    } catch {
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchTrending(false);
    const interval = setInterval(() => fetchTrending(true), 30000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading)
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-6 bg-[#203d11]/10 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-[#f5f0e8]/50 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );

  const rankColors = [
    'bg-yellow-100 text-yellow-700',
    'bg-gray-200 text-gray-600',
    'bg-orange-100 text-orange-700',
    'bg-[#f5f0e8] text-[#203d11]/60',
  ];

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[#203d11]">Trending tuần này</h2>
        {weekId && <span className="text-xs text-[#203d11]/50">{weekId}</span>}
      </div>
      <div className="flex bg-[#f5f0e8]/50 rounded-xl p-1 mb-4">
        {(['searches', 'posts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition ${tab === t ? 'bg-white text-[#203d11] shadow-sm' : 'text-[#203d11]/60 hover:text-[#203d11]'}`}
          >
            {t === 'searches' ? 'Tìm kiếm' : 'Bài viết'}
          </button>
        ))}
      </div>
      {tab === 'searches' && (
        <div className="space-y-2">
          {topSearches.length === 0 ? (
            <p className="text-sm text-[#203d11]/60 text-center py-4">Chưa có dữ liệu</p>
          ) : (
            topSearches.map((item, i) => (
              <div
                key={item.term}
                onClick={() => router.push(`/cooking?ingredient=${encodeURIComponent(item.term)}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#f5f0e8]/50 cursor-pointer transition group"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${rankColors[Math.min(i, 3)]}`}
                >
                  {i + 1}
                </div>
                <span className="flex-1 font-semibold text-[#203d11] group-hover:text-[#975b1d] transition truncate">
                  {item.term}
                </span>
                <span className="text-xs text-[#203d11]/50">{item.searchCount} lượt</span>
              </div>
            ))
          )}
        </div>
      )}
      {tab === 'posts' && (
        <div className="space-y-2">
          {topPosts.length === 0 ? (
            <p className="text-sm text-[#203d11]/60 text-center py-4">Chưa có bài viết</p>
          ) : (
            topPosts.map((post, i) => (
              <div
                key={post.postId}
                onClick={() => router.push(`/post/${post.postId}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#f5f0e8]/50 cursor-pointer transition group"
              >
                <div
                  className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-xs ${rankColors[Math.min(i, 3)]}`}
                >
                  {i + 1}
                </div>
                {post.image && normalizeImageUrl(post.image) && (
                  <img
                    src={normalizeImageUrl(post.image)!}
                    alt=""
                    className="w-10 h-10 flex-shrink-0 rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#203d11]/60 mb-0.5">@{post.authorName}</p>
                  <p className="font-semibold text-[#203d11] group-hover:text-[#975b1d] transition line-clamp-2 text-sm">
                    {post.title || 'Bài viết'}
                  </p>
                </div>
                <span className="text-xs text-[#975b1d] flex-shrink-0">{post.likesThisWeek} likes</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const prefetchedDataRef = useRef<{ posts: Post[]; nextToken?: string } | null>(null);
  const isPrefetchingRef = useRef(false);

  usePostAvatarsPreload(posts);

  const handleStatsUpdate = useCallback((stats: Record<string, PostStats>) => {
    setPosts((prev) =>
      prev.map((post) => {
        const id = post.post_id || post.postId;
        const s = stats[id];
        return s
          ? {
              ...post,
              likes_count: s.likes_count,
              likeCount: s.likes_count,
              comments_count: s.comments_count,
              commentCount: s.comments_count,
              user_reaction: s.user_reaction,
            }
          : post;
      })
    );
  }, []);

  const postIds = useMemo(() => posts.map((p) => p.post_id || p.postId).filter(Boolean), [posts]);
  usePostsStatsPolling({
    postIds,
    token,
    interval: 10000,
    enabled: posts.length > 0,
    onStatsUpdate: handleStatsUpdate,
  });

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (searchQuery) {
      // Support multiple keywords separated by comma
      const keywords = searchQuery
        .toLowerCase()
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      result = result.filter((p) => {
        if (!p.recipeData) return false;

        const title = (p.recipeData.title || '').toLowerCase();
        const ingredients = p.recipeData.ingredients || [];
        const ingredientNames = ingredients.map((ing: any) => {
          const name = ing.vietnamese || ing.name || ing.english || '';
          return name.toLowerCase();
        });

        // Check if ALL keywords match (AND logic)
        return keywords.every((keyword) => {
          // Match in title
          if (title.includes(keyword)) return true;
          // Match in any ingredient
          if (ingredientNames.some((name) => name.includes(keyword))) return true;
          return false;
        });
      });
    }
    if (searchQuery && result.length > 0) {
      result = [...result].sort((a, b) => {
        switch (sortBy) {
          case 'newest':
            return (b.created_at || b.createdAt || 0) - (a.created_at || a.createdAt || 0);
          case 'oldest':
            return (a.created_at || a.createdAt || 0) - (b.created_at || b.createdAt || 0);
          case 'most_liked':
            return (b.likes_count || b.likeCount || 0) - (a.likes_count || a.likeCount || 0);
          default:
            return 0;
        }
      });
    }
    return result;
  }, [posts, searchQuery, sortBy]);

  useEffect(() => {
    if (!token) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadFeed(false, false);
    }
    const interval = setInterval(() => loadFeed(false, true), 30000);
    return () => clearInterval(interval);
  }, [token]);

  const prefetchNextBatch = async () => {
    if (!token || !nextToken || isPrefetchingRef.current || prefetchedDataRef.current) return;
    isPrefetchingRef.current = true;
    try {
      const r = await getFeed(token, 20, nextToken);
      prefetchedDataRef.current = {
        posts: (r.posts || []) as unknown as Post[],
        nextToken: r.nextToken,
      };
    } catch {
    } finally {
      isPrefetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (!loadMoreTriggerRef.current || !nextToken) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && nextToken) {
          const prefetchedData = prefetchedDataRef.current;
          if (prefetchedData && prefetchedData.posts) {
            setPosts((prev) => [...prev, ...prefetchedData.posts]);
            setNextToken(prefetchedData.nextToken);
            prefetchedDataRef.current = null;
          } else loadFeed(true, false);
        }
      },
      { root: null, rootMargin: '400px', threshold: 0 }
    );
    observerRef.current.observe(loadMoreTriggerRef.current);
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [nextToken, loadingMore]);

  useEffect(() => {
    if (!nextToken || posts.length === 0) return;
    const handleScroll = () => {
      const pct = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      if (pct > 0.6 && !prefetchedDataRef.current && !isPrefetchingRef.current) prefetchNextBatch();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [nextToken, posts.length, token]);

  const loadFeed = async (isLoadMore = false, isPolling = false) => {
    if (!token) return;
    try {
      if (!isLoadMore && !isPolling) setLoading(true);
      if (isLoadMore) setLoadingMore(true);
      const r = await getFeed(token, 20, isLoadMore ? nextToken : undefined);
      const data = (r.posts || []) as unknown as Post[];
      if (isLoadMore) setPosts((prev) => [...prev, ...data]);
      else if (isPolling) {
        setPosts((prev) => {
          const ids = new Set(prev.map((p) => p.post_id || p.postId));
          const newPosts = data.filter((p) => !ids.has(p.post_id || p.postId));
          const updated = prev.map(
            (ep) => data.find((p) => (p.post_id || p.postId) === (ep.post_id || ep.postId)) || ep
          );
          return [...newPosts, ...updated];
        });
      } else setPosts(data);
      setNextToken(r.nextToken);
      if (!isPolling) setError(null);
    } catch (err) {
      if (!isPolling) setError(err instanceof Error ? err.message : 'Không thể tải bài viết');
    } finally {
      if (!isPolling) setLoading(false);
      setLoadingMore(false);
    }
  };

  const handlePostCreated = (newPost?: any) => {
    if (newPost) {
      const p: Post = {
        postId: newPost.postId || newPost.post_id,
        post_id: newPost.postId || newPost.post_id,
        authorId: newPost.authorId || user?.sub || user?.userId || '',
        user_id: newPost.authorId || newPost.user_id || user?.sub || user?.userId,
        username: user?.username || user?.fullName || 'You',
        user_avatar: user?.avatarUrl,
        content: newPost.title || newPost.content,
        images: newPost.images?.quickImages || newPost.images || [],
        privacy: newPost.privacyLevel || newPost.privacy || 'public',
        likeCount: 0,
        likes_count: 0,
        commentCount: 0,
        comments_count: 0,
        user_reaction: undefined,
        createdAt: Date.now(),
        created_at: Date.now(),
        updatedAt: Date.now(),
        recipeData: newPost.recipeData,
        recipe_id: newPost.recipeId,
      };
      setPosts((prev) => [p, ...prev]);
    } else loadFeed(false, false);
  };

  const handleDeletePost = (id?: string) => {
    if (id) setPosts((prev) => prev.filter((p) => p.post_id !== id));
    else loadFeed(false, false);
  };
  const handlePostUpdated = () => loadFeed(false, false);

  if (loading) return <DashboardSkeleton />;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white pb-20 lg:pb-6 overflow-x-hidden">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Mobile: Search & Trending on top */}
          <div className="lg:hidden mb-6">
            <SearchSection
              onSearch={(q) => setSearchQuery(q)}
              onClear={() => {
                setSearchQuery('');
                setSortBy('newest');
              }}
              searchQuery={searchQuery}
              resultCount={filteredPosts.length}
              hasSearched={!!searchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
            <TrendingSection />
          </div>
          
          <div className="flex gap-6">
            {/* Desktop: Sidebar */}
            <div className={`hidden lg:block relative flex-shrink-0 transition-all duration-300 ${sidebarOpen ? 'w-[336px]' : 'w-12'}`}>
              <div className={`absolute top-0 transition-all duration-300 w-80 ${sidebarOpen ? 'opacity-100 translate-x-0 right-12' : 'opacity-0 -translate-x-4 pointer-events-none right-12'}`}>
                <SearchSection
                  onSearch={(q) => setSearchQuery(q)}
                  onClear={() => {
                    setSearchQuery('');
                    setSortBy('newest');
                  }}
                  searchQuery={searchQuery}
                  resultCount={filteredPosts.length}
                  hasSearched={!!searchQuery}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
                <TrendingSection />
              </div>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="absolute right-0 top-0 h-10 w-10 bg-white border border-[#203d11]/10 rounded-xl flex items-center justify-center shadow-sm hover:bg-[#f5f0e8] transition-colors"
                title={sidebarOpen ? 'Thu gọn' : 'Mở rộng'}
                aria-label={sidebarOpen ? 'Thu gọn sidebar' : 'Mở rộng sidebar'}
              >
                <svg className={`w-4 h-4 text-[#203d11] transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
            
            {/* Main content */}
            <div className={`flex-1 min-w-0 w-full lg:max-w-[800px] ${sidebarOpen ? '' : 'mx-auto'}`}>
              <div className="mb-6">
                <Suspense
                  fallback={
                    <div className="bg-white rounded-2xl shadow-xl p-6 animate-pulse h-32" />
                  }
                >
                  <CreatePostForm onPostCreated={handlePostCreated} />
                </Suspense>
              </div>
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              {searchQuery && filteredPosts.length > 0 && (
                <div className="mb-4 p-3 bg-[#203d11]/5 border border-[#203d11]/10 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-[#203d11]">
                    Tìm thấy <span className="font-bold">{filteredPosts.length}</span> bài viết cho
                    "{searchQuery}"
                  </span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-[#975b1d] hover:text-[#203d11] text-sm font-semibold"
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              )}
              {filteredPosts.length === 0 && !searchQuery ? (
                <div className="bg-white rounded-2xl shadow-xl p-12 text-center border border-[#203d11]/5">
                  <div className="w-20 h-20 bg-[#f5f0e8] rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-2xl font-bold text-[#203d11]">EC</span>
                  </div>
                  <h3 className="text-xl font-bold text-[#203d11] mb-3">
                    Chào mừng đến Everyone Cook!
                  </h3>
                  <p className="text-[#203d11]/70 mb-6 max-w-md mx-auto">
                    Kết nối với những người yêu ẩm thực và chia sẻ công thức nấu ăn của bạn.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => router.push('/friends')}
                      className="px-6 py-3 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition font-semibold shadow-sm"
                    >
                      Tìm bạn bè
                    </button>
                    <button
                      onClick={() => router.push('/cooking')}
                      className="px-6 py-3 h-12 bg-white text-[#203d11] border-2 border-[#203d11]/20 rounded-xl hover:bg-[#f5f0e8] transition font-semibold"
                    >
                      Khám phá công thức
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredPosts
                    .filter((p) => p.post_id || p.postId)
                    .map((post, i) => (
                      <Suspense
                        key={post.post_id}
                        fallback={
                          <div className="bg-white rounded-2xl shadow-xl p-6 animate-pulse h-48" />
                        }
                      >
                        <PostCard
                          post={post}
                          onPostDeleted={() => handleDeletePost(post.post_id)}
                          onPostUpdated={handlePostUpdated}
                          priority={i < 3}
                        />
                      </Suspense>
                    ))}
                  {nextToken && (
                    <div ref={loadMoreTriggerRef} className="text-center py-6">
                      {loadingMore ? (
                        <div className="flex items-center justify-center gap-2 text-[#203d11]/60">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#203d11]" />
                          <span>Đang tải thêm...</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => loadFeed(true, false)}
                          className="px-8 py-3 h-12 bg-white text-[#203d11] rounded-xl border-2 border-[#203d11]/20 hover:bg-[#f5f0e8] transition font-semibold shadow-sm"
                        >
                          Tải thêm bài viết
                        </button>
                      )}
                    </div>
                  )}
                  {!nextToken && posts.length > 0 && (
                    <div className="text-center py-8 text-[#203d11]/50 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-px w-12 bg-[#203d11]/20" />
                        <span>Bạn đã xem hết bài viết</span>
                        <div className="h-px w-12 bg-[#203d11]/20" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
