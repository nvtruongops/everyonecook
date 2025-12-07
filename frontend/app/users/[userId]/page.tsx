'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AddFriendButton from '@/components/friends/AddFriendButton';
import PostCard from '@/components/posts/PostCard';
import AboutSection from '@/components/profile/AboutSection';
import BackgroundDisplay from '@/components/profile/BackgroundDisplay';
import CustomSectionView from '@/components/profile/CustomSectionView';
import CachedAvatar from '@/components/ui/CachedAvatar';
import BottomNav from '@/components/mobile/BottomNav';
import { Post } from '@/services/posts';

interface CustomField { fieldId: string; value: string; order: number }
interface CustomSection { sectionId: string; title: string; description?: string; privacy: 'public' | 'friends' | 'private'; order: number; fields: CustomField[] }
interface UserProfile { user_id: string; username: string; email?: string; full_name?: string; avatar_url?: string; background_url?: string; bio?: string; date_of_birth?: string; gender?: 'male' | 'female' | 'other' | ''; country?: string; created_at: string; friend_count?: number; mutual_friends_count?: number; is_friend?: boolean }
interface PrivacySettings { bio?: 'public' | 'friends' | 'private'; email?: 'public' | 'friends' | 'private'; date_of_birth?: 'public' | 'friends' | 'private'; gender?: 'public' | 'friends' | 'private'; country?: 'public' | 'friends' | 'private' }

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { token, user: currentUser, isLoading: authLoading } = useAuth();
  const userId = params.userId as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [viewerRelationship, setViewerRelationship] = useState<'self' | 'friend' | 'stranger'>('stranger');
  const [shouldRedirectToOwnProfile, setShouldRedirectToOwnProfile] = useState(false);

  useEffect(() => { if (shouldRedirectToOwnProfile) router.push('/profile'); }, [shouldRedirectToOwnProfile, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.push('/login'); return; }
    const fetchProfile = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/users/${userId}/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(res.status === 404 ? 'Người dùng không tồn tại' : 'Không thể tải hồ sơ');
        const data = await res.json();
        setProfile(data.data?.profile || data.profile);
        setViewerRelationship(data.data?.relationship || 'stranger');
        if (data.data?.privacy) {
          const p = data.data.privacy;
          setPrivacySettings({ bio: p.bio || 'public', email: p.email || 'private', date_of_birth: p.birthday || 'private', gender: p.gender || 'private', country: p.country || 'public' });
        }
        try {
          const sectionsRes = await fetch(`${API_URL}/users/${userId}/custom-sections`, { headers: { Authorization: `Bearer ${token}` } });
          if (sectionsRes.ok) { const d = await sectionsRes.json(); setCustomSections(d.data?.sections || []); }
        } catch {}
      } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load profile'); }
      finally { setLoading(false); }
    };
    fetchProfile();
  }, [token, userId, authLoading]);

  useEffect(() => {
    if (!token || !profile) return;
    const fetchUserPosts = async () => {
      try {
        setPostsLoading(true);
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/users/${userId}/posts?limit=10`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setPosts((data.posts || []).map((item: any) => ({ ...item, postId: item.postId || item.post_id, post_id: item.post_id || item.postId, postType: item.postType || item.post_type, post_type: item.post_type || item.postType, sharedPost: item.sharedPost })));
        }
      } catch {} finally { setPostsLoading(false); }
    };
    fetchUserPosts();
  }, [token, userId, profile]);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 px-4 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11] mx-auto" />
        <p className="mt-4 text-[#203d11]/70">Đang tải hồ sơ...</p>
      </div>
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 px-4">
      <div className="max-w-[1200px] mx-auto">
        <div className="bg-white shadow-xl rounded-2xl p-8 text-center border border-[#203d11]/5">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-xl font-bold text-red-600">!</span></div>
          <h2 className="text-xl font-bold text-[#203d11] mb-2">Không tìm thấy hồ sơ</h2>
          <p className="text-[#203d11]/70 mb-4">{error || 'Người dùng không tồn tại'}</p>
          <button onClick={() => router.back()} className="px-4 py-2 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition font-semibold">Quay lại</button>
        </div>
      </div>
    </div>
  );

  if (currentUser?.sub === profile.user_id) {
    if (!shouldRedirectToOwnProfile) setShouldRedirectToOwnProfile(true);
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 px-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11] mx-auto" />
          <p className="mt-4 text-[#203d11]/70">Đang chuyển hướng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 pb-20 lg:pb-12">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <button onClick={() => router.back()} className="text-[#203d11] hover:text-[#975b1d] inline-flex items-center gap-2 mb-4 h-12 font-semibold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Quay lại
        </button>
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden mb-6 border border-[#203d11]/5">
          <BackgroundDisplay backgroundUrl={profile.background_url} variant="profile" className="w-full" />
          <div className="px-6 pb-6">
            <div className="relative flex flex-col items-center -mt-20 mb-4">
              <div className="relative border-4 border-white shadow-lg rounded-full mb-4">
                <CachedAvatar src={profile.avatar_url} alt={profile.full_name || profile.username} fallbackText={profile.username?.charAt(0) || 'U'} size="2xl" priority className="w-32 h-32 sm:w-40 sm:h-40" />
              </div>
              <div className="text-center mb-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#203d11]">{profile.full_name || profile.username}</h1>
                <p className="text-base sm:text-lg text-[#203d11]/60 mt-1 font-mono">@{profile.username}</p>
              </div>
              <AddFriendButton userId={profile.user_id} username={profile.username} />
            </div>
            <div className="flex gap-8 justify-center pt-4 border-t border-[#203d11]/10">
              <div className="h-12 flex items-center">
                <div className="text-center">
                  <div className="font-bold text-[#203d11] text-xl">{profile.friend_count || 0}</div>
                  <div className="text-[#203d11]/60 text-sm">Bạn bè</div>
                </div>
              </div>
              {profile.mutual_friends_count ? (
                <div className="h-12 flex items-center">
                  <div className="text-center">
                    <div className="font-bold text-[#203d11] text-xl">{profile.mutual_friends_count}</div>
                    <div className="text-[#203d11]/60 text-sm">Bạn bè chung</div>
                  </div>
                </div>
              ) : null}
              <div className="h-12 flex items-center">
                <div className="text-center">
                  <div className="font-bold text-[#203d11] text-xl">{posts.length}</div>
                  <div className="text-[#203d11]/60 text-sm">Bài viết</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <AboutSection profile={{ full_name: profile.full_name, bio: profile.bio, date_of_birth: profile.date_of_birth, gender: profile.gender, country: profile.country, email: profile.email }} privacySettings={privacySettings} isOwnProfile={false} viewerRelationship={viewerRelationship} />
        {customSections.length > 0 && customSections.sort((a, b) => a.order - b.order).map((section) => (
          <CustomSectionView key={section.sectionId} section={section} isOwnProfile={false} />
        ))}
        <div className="bg-white shadow-xl rounded-2xl p-6 border border-[#203d11]/5">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-[#203d11]">Bài viết</h2>
          </div>
          {postsLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11] mx-auto" />
              <p className="mt-4 text-[#203d11]/70">Đang tải bài viết...</p>
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post: any, index: number) => <PostCard key={post.post_id || post.postId} post={post} priority={index === 0} />)}
            </div>
          ) : (
            <div className="text-center py-12 bg-[#f5f0e8]/50 rounded-2xl border-2 border-dashed border-[#203d11]/20">
              <div className="w-16 h-16 bg-[#f5f0e8] rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-xl font-bold text-[#203d11]">0</span></div>
              <h3 className="text-lg font-bold text-[#203d11] mb-2">Chưa có bài viết nào</h3>
              <p className="text-[#203d11]/70">Người dùng chưa chia sẻ bất kì bài viết nào</p>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
