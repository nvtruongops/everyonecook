'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserPosts } from '@/services/posts';
import type { Post } from '@/types/posts';
import PostCard from '@/components/posts/PostCard';
import ProtectedRoute from '@/components/ProtectedRoute';
import CachedAvatar from '@/components/ui/CachedAvatar';
import BottomNav from '@/components/mobile/BottomNav';
import BackgroundDisplay from '@/components/profile/BackgroundDisplay';
import AboutSection from '@/components/profile/AboutSection';
import CustomSectionView from '@/components/profile/CustomSectionView';

interface UserStats { friend_count: number; post_count: number }
interface ProfileData { avatar_url?: string; username?: string; full_name?: string; bio?: string; date_of_birth?: string; gender?: 'male' | 'female' | 'other' | ''; country?: string; background_url?: string; email?: string }
interface PrivacySettings { bio?: 'public' | 'friends' | 'private'; email?: 'public' | 'friends' | 'private'; date_of_birth?: 'public' | 'friends' | 'private'; gender?: 'public' | 'friends' | 'private'; country?: 'public' | 'friends' | 'private' }
interface CustomField { fieldId: string; value: string; order: number }
interface CustomSection { sectionId: string; title: string; description?: string; privacy: 'public' | 'friends' | 'private'; order: number; fields: CustomField[] }

function ProfilePageContent() {
  const [profile, setProfile] = useState<ProfileData>({});
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({});
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [stats, setStats] = useState<UserStats>({ friend_count: 0, post_count: 0 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState('');
  const { user, token, avatarUrl: contextAvatarUrl, updateAvatar } = useAuth();
  const updateAvatarRef = useRef(updateAvatar);
  useEffect(() => { updateAvatarRef.current = updateAvatar; }, [updateAvatar]);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!token || !user) return;
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const profileRes = await fetch(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (profileRes.ok) {
          const data = await profileRes.json();
          const p = data.data?.profile || data.data || {};
          setProfile(p);
          if (p.avatar_url && p.avatar_url !== contextAvatarUrl) updateAvatarRef.current(p.avatar_url);
        }
        const statsRes = await fetch(`${API_URL}/users/me/stats`, { headers: { Authorization: `Bearer ${token}` } });
        if (statsRes.ok) { const d = await statsRes.json(); setStats(d.stats || { friend_count: 0, post_count: 0 }); }
        try {
          const privacyRes = await fetch(`${API_URL}/users/profile/privacy`, { headers: { Authorization: `Bearer ${token}` } });
          if (privacyRes.ok) {
            const d = await privacyRes.json();
            const p = d.data?.privacy || d.data || {};
            setPrivacySettings({ bio: p.bio || 'public', email: p.email || 'private', date_of_birth: p.birthday || 'private', gender: p.gender || 'private', country: p.country || 'public' });
          }
        } catch {}
        try {
          const sectionsRes = await fetch(`${API_URL}/users/profile/custom-sections`, { headers: { Authorization: `Bearer ${token}` } });
          if (sectionsRes.ok) { const d = await sectionsRes.json(); setCustomSections(d.data?.sections || []); }
        } catch {}
      } catch { setError('Không thể tải hồ sơ'); }
    };
    fetchProfileData();
  }, [token, user?.userId, contextAvatarUrl]);

  useEffect(() => {
    const fetchPosts = async () => {
      if (!token || !user?.userId) return;
      try {
        setLoadingPosts(true);
        const res = await getUserPosts(token, user.userId, 20);
        const items = res.posts || [];
        setPosts(items.map((item: any) => ({
          postId: item.postId || item.post_id, post_id: item.post_id || item.postId,
          authorId: item.authorId || item.user_id, user_id: item.user_id || item.authorId,
          username: item.username, user_avatar: item.user_avatar, content: item.content, images: item.images,
          recipeId: item.recipeId || item.recipe_id, recipe_id: item.recipe_id || item.recipeId, recipeData: item.recipeData,
          postType: item.postType || item.post_type, post_type: item.post_type || item.postType, sharedPost: item.sharedPost,
          privacy: item.privacy || (item.is_public ? 'public' : 'private'), is_public: item.is_public,
          likeCount: item.likeCount || item.likes_count || 0, likes_count: item.likes_count || item.likeCount || 0,
          commentCount: item.commentCount || item.comments_count || 0, comments_count: item.comments_count || item.commentCount || 0,
          isLiked: item.isLiked || !!item.user_reaction, user_reaction: item.user_reaction,
          createdAt: item.createdAt || item.created_at, created_at: item.created_at || item.createdAt,
          updatedAt: item.updatedAt || item.updated_at || item.createdAt || item.created_at,
        })));
      } catch {} finally { setLoadingPosts(false); }
    };
    fetchPosts();
  }, [token, user?.userId]);

  const reloadPosts = async () => {
    if (!user?.userId || !token) return;
    const res = await getUserPosts(token, user.userId, 20);
    const items = res.posts || [];
    setPosts(items.map((item: any) => ({
      postId: item.postId || item.post_id, post_id: item.post_id || item.postId,
      authorId: item.authorId || item.user_id, user_id: item.user_id || item.authorId,
      username: item.username, user_avatar: item.user_avatar, content: item.content, images: item.images,
      recipeId: item.recipeId || item.recipe_id, recipe_id: item.recipe_id || item.recipeId, recipeData: item.recipeData,
      postType: item.postType, privacy: item.privacy || (item.is_public ? 'public' : 'private'), is_public: item.is_public,
      likeCount: item.likeCount || item.likes_count || 0, likes_count: item.likes_count || item.likeCount || 0,
      commentCount: item.commentCount || item.comments_count || 0, comments_count: item.comments_count || item.commentCount || 0,
      isLiked: item.isLiked || !!item.user_reaction, user_reaction: item.user_reaction,
      createdAt: item.createdAt || item.created_at, created_at: item.created_at || item.createdAt,
      updatedAt: item.updatedAt || item.updated_at || item.createdAt || item.created_at,
    })));
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 pb-20 lg:pb-12">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <Link href="/dashboard" className="text-[#203d11] hover:text-[#975b1d] inline-flex items-center gap-2 mb-4 h-12 font-semibold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Quay lại
        </Link>
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4"><p className="text-sm text-red-800">{error}</p></div>}
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden mb-6 border border-[#203d11]/5">
          <BackgroundDisplay backgroundUrl={profile.background_url} variant="profile" className="w-full" />
          <div className="px-6 pb-6">
            <div className="relative flex flex-col items-center -mt-20 mb-4">
              <div className="relative border-4 border-white shadow-lg rounded-full mb-4">
                <CachedAvatar isCurrentUser alt={profile.full_name || user.email || 'User'} fallbackText={profile.full_name?.charAt(0) || user.email?.charAt(0) || 'U'} size="2xl" priority className="w-32 h-32 sm:w-40 sm:h-40" />
              </div>
              <div className="text-center mb-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#203d11]">{profile.full_name || 'User'}</h1>
                <p className="text-base sm:text-lg text-[#203d11]/60 mt-1 font-mono">@{profile.username || user?.email?.split('@')[0] || 'user'}</p>
              </div>
              <Link href="/profile/edit" className="inline-flex items-center px-5 py-2.5 h-12 border-2 border-[#203d11]/20 text-sm font-semibold rounded-xl text-[#203d11] bg-white hover:bg-[#f5f0e8] transition">Chỉnh sửa hồ sơ</Link>
            </div>
            <div className="flex gap-8 justify-center pt-4 border-t border-[#203d11]/10">
              <Link href="/friends" className="hover:text-[#975b1d] transition h-12 flex items-center">
                <div className="text-center">
                  <div className="font-bold text-[#203d11] text-xl">{stats.friend_count}</div>
                  <div className="text-[#203d11]/60 text-sm">Bạn bè</div>
                </div>
              </Link>
              <div className="h-12 flex items-center">
                <div className="text-center">
                  <div className="font-bold text-[#203d11] text-xl">{stats.post_count}</div>
                  <div className="text-[#203d11]/60 text-sm">Bài viết</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <AboutSection profile={profile} privacySettings={privacySettings} isOwnProfile={true} />
        {customSections.length > 0 && customSections.sort((a, b) => a.order - b.order).map((section) => (
          <CustomSectionView key={section.sectionId} section={section} isOwnProfile={true} />
        ))}
        <div className="bg-white shadow-xl rounded-2xl p-6 border border-[#203d11]/5">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-[#203d11]">Bài viết của tôi</h2>
            <Link href="/dashboard" className="text-sm text-[#975b1d] hover:text-[#203d11] font-semibold">Tạo bài viết mới</Link>
          </div>
          {loadingPosts ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11] mx-auto" />
              <p className="mt-4 text-[#203d11]/70">Đang tải bài viết...</p>
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post, index) => (
                <PostCard key={post.postId} post={post} priority={index === 0} onPostDeleted={async () => { setPosts(posts.filter((p) => p.postId !== post.postId)); setStats((prev) => ({ ...prev, post_count: prev.post_count - 1 })); }} onPostUpdated={reloadPosts} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-[#f5f0e8]/50 rounded-2xl border-2 border-dashed border-[#203d11]/20">
              <div className="w-16 h-16 bg-[#f5f0e8] rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-xl font-bold text-[#203d11]">0</span></div>
              <h3 className="text-lg font-bold text-[#203d11] mb-2">Chưa có bài viết nào</h3>
              <p className="text-[#203d11]/70 mb-4">Chia sẻ trải nghiệm nấu ăn với bạn bè nhé!</p>
              <Link href="/dashboard" className="inline-flex items-center px-4 py-2 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition font-semibold">Tạo bài viết đầu tiên</Link>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

export default function ProfilePage() {
  return <ProtectedRoute><ProfilePageContent /></ProtectedRoute>;
}
