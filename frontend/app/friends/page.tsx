'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  getFriends, getPendingRequests, getSentRequests, getBlockedUsers,
  acceptFriendRequest, rejectFriendRequest, cancelFriendRequest,
  removeFriend, blockUser, unblockUser, Friend, FriendRequest,
} from '@/services/friends';
import FriendRequestCard from '@/components/friends/FriendRequestCard';
import FriendCard from '@/components/friends/FriendCard';
import BlockedUserCard from '@/components/friends/BlockedUserCard';
import SentRequestCard from '@/components/friends/SentRequestCard';
import UserSearch from '@/components/friends/UserSearch';

type Tab = 'all' | 'pending' | 'sent' | 'blocked' | 'search';

function FriendsPageContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const getInitialTab = (): Tab => {
    const t = searchParams.get('tab');
    return t && ['all', 'pending', 'sent', 'blocked', 'search'].includes(t) ? (t as Tab) : 'all';
  };
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['all', 'pending', 'sent', 'blocked', 'search'].includes(t)) setActiveTab(t as Tab);
  }, [searchParams]);

  const loadFriends = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [all, pending, sent, blocked] = await Promise.all([
        getFriends(token), getPendingRequests(token), getSentRequests(token), getBlockedUsers(token),
      ]);
      setFriends(all || []);
      setPendingRequests(pending || []);
      setSentRequests(sent || []);
      setBlockedUsers(blocked || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách bạn bè');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasLoadedRef.current || !token) return;
    hasLoadedRef.current = true;
    loadFriends();
  }, [token]);

  const handleAccept = async (userId: string) => {
    if (!token) return;
    try { await acceptFriendRequest(userId, token); await loadFriends(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể chấp nhận'); }
  };
  const handleReject = async (userId: string) => {
    if (!token) return;
    try { await rejectFriendRequest(userId, token); await loadFriends(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể từ chối'); }
  };
  const handleBlock = async (userId: string) => {
    if (!token) return;
    try { await blockUser(userId, token); await loadFriends(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể chặn'); }
  };
  const handleRemove = async (userId: string) => {
    if (!token) return;
    try { await removeFriend(userId, token); await loadFriends(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể hủy kết bạn'); }
  };
  const handleUnblock = async (userId: string) => {
    if (!token) return;
    try { await unblockUser(userId, token); await loadFriends(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể bỏ chặn'); }
  };
  const handleCancelRequest = async (userId: string) => {
    if (!token) return;
    setCancelLoading(userId);
    try { await cancelFriendRequest(userId, token); await loadFriends(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể hủy lời mời'); }
    finally { setCancelLoading(null); }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: 'Tất cả', count: friends.length },
    { key: 'pending', label: 'Chờ xử lý', count: pendingRequests.length },
    { key: 'sent', label: 'Đã gửi', count: sentRequests.length },
    { key: 'blocked', label: 'Đã chặn', count: blockedUsers.length },
    { key: 'search', label: 'Tìm bạn' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 pb-20 lg:pb-8">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <button onClick={() => window.history.back()} className="inline-flex items-center text-[#203d11] hover:text-[#975b1d] transition h-12 font-semibold text-sm mb-4">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Quay lại
          </button>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#203d11] mb-2">Bạn bè</h1>
          <p className="text-[#203d11]/70 font-medium">Quản lý tình bạn và kết nối với người khác</p>
        </div>
        <div className="mb-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-[#203d11]/5 p-1.5 shadow-xl">
          <nav className="flex space-x-2 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`py-3 px-4 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${activeTab === t.key ? 'bg-white text-[#203d11] shadow-sm border border-[#203d11]/10' : 'text-[#203d11]/60 hover:text-[#203d11] hover:bg-white/40'}`}>
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-2 bg-[#203d11]/10 text-[#203d11] py-0.5 px-2 rounded-full text-xs font-bold">{t.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        {error && <div className="mb-6 bg-red-50/80 border border-red-200/50 text-red-700 px-5 py-4 rounded-2xl font-medium text-sm">{error}</div>}
        {loading && activeTab !== 'search' && (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-3 border-[#203d11]/20 border-t-[#203d11]" />
            <p className="mt-5 text-[#203d11]/70 font-medium">Đang tải...</p>
          </div>
        )}
        {!loading && (
          <>
            {activeTab === 'all' && (friends.length === 0 ? (
              <EmptyState title="Chưa có bạn bè" desc="Bắt đầu kết nối với những người khác" action={() => setActiveTab('search')} actionText="Tìm bạn bè" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {friends.map((f) => <FriendCard key={f.userId} friend={f} onRemove={() => handleRemove(f.userId)} />)}
              </div>
            ))}
            {activeTab === 'pending' && (pendingRequests.length === 0 ? (
              <EmptyState title="Không có yêu cầu chờ xử lý" desc="Bạn hiện không có lời mời kết bạn nào" />
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((r) => <FriendRequestCard key={r.fromUserId} request={r} onAccept={() => handleAccept(r.fromUserId)} onReject={() => handleReject(r.fromUserId)} onBlock={() => handleBlock(r.fromUserId)} />)}
              </div>
            ))}
            {activeTab === 'sent' && (sentRequests.length === 0 ? (
              <EmptyState title="Chưa gửi lời mời nào" desc="Bạn chưa gửi lời mời kết bạn cho ai" action={() => setActiveTab('search')} actionText="Tìm bạn bè" />
            ) : (
              <div className="space-y-4">
                {sentRequests.map((r) => <SentRequestCard key={r.fromUserId} request={r} onCancel={() => handleCancelRequest(r.fromUserId)} loading={cancelLoading === r.fromUserId} />)}
              </div>
            ))}
            {activeTab === 'blocked' && (blockedUsers.length === 0 ? (
              <EmptyState title="Không có người dùng bị chặn" desc="Bạn chưa chặn ai cả" />
            ) : (
              <div className="space-y-4">
                {blockedUsers.map((u) => <BlockedUserCard key={u.userId} blockedUser={u} onUnblock={() => handleUnblock(u.userId)} />)}
              </div>
            ))}
            {activeTab === 'search' && <UserSearch />}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, desc, action, actionText }: { title: string; desc: string; action?: () => void; actionText?: string }) {
  return (
    <div className="text-center py-16 bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-[#203d11]/5">
      <div className="w-20 h-20 bg-[#f5f0e8] rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-2xl font-bold text-[#203d11]">0</span>
      </div>
      <h3 className="text-2xl font-bold text-[#203d11] mb-2">{title}</h3>
      <p className="text-[#203d11]/70 font-medium mb-8">{desc}</p>
      {action && actionText && (
        <button onClick={action} className="inline-flex items-center px-6 py-3 h-12 rounded-xl text-sm font-semibold text-white bg-[#203d11] hover:bg-[#2a5016] transition-all">{actionText}</button>
      )}
    </div>
  );
}

function FriendsPageLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="h-10 bg-[#203d11]/20 rounded-lg w-1/4 mb-3" />
          <div className="h-5 bg-[#203d11]/15 rounded w-1/3 mb-8" />
          <div className="h-14 bg-white/50 rounded-2xl mb-7" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white/50 rounded-2xl" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FriendsPage() {
  return <Suspense fallback={<FriendsPageLoading />}><FriendsPageContent /></Suspense>;
}
