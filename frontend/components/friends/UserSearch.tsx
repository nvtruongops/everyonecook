'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchUsers, sendFriendRequest, acceptFriendRequest } from '@/services/friends';
import CachedAvatar from '@/components/ui/CachedAvatar';
import { useAuth } from '@/contexts/AuthContext';

interface SearchResult {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  friendship_status:
    | 'none'
    | 'friends'
    | 'pending_sent'
    | 'pending_received'
    | 'blocked'
    | 'blocked_by';
  is_friend: boolean;
  is_pending_sent: boolean;
  is_pending_received: boolean;
}

export default function UserSearch() {
  const router = useRouter();
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (query.trim().length < 2) {
      setError('Vui lòng nhập ít nhất 2 ký tự');
      return;
    }
    if (!token) {
      setError('Vui lòng đăng nhập');
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await searchUsers(token, query.trim(), 20);
      setResults(res.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tìm kiếm thất bại');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (userId: string) => {
    if (!token) {
      setError('Vui lòng đăng nhập');
      return;
    }
    setSendingRequest(userId);
    setError(null);
    try {
      await sendFriendRequest(token, userId);
      setResults((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, is_pending_sent: true, friendship_status: 'pending_sent' as const }
            : u
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi lời mời');
    } finally {
      setSendingRequest(null);
    }
  };

  const handleAcceptRequest = async (userId: string) => {
    if (!token) {
      setError('Vui lòng đăng nhập');
      return;
    }
    setSendingRequest(userId);
    setError(null);
    try {
      await acceptFriendRequest(userId, token);
      setResults((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? {
                ...u,
                is_friend: true,
                is_pending_received: false,
                friendship_status: 'friends' as const,
              }
            : u
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chấp nhận');
    } finally {
      setSendingRequest(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-[#203d11]/5">
      <h2 className="text-lg sm:text-xl font-bold text-[#203d11] mb-4">Tìm bạn bè</h2>
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Tìm kiếm tài khoản..."
          className="flex-1 h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
        />
        <button
          onClick={handleSearch}
          disabled={loading || query.trim().length < 2}
          className="px-6 h-12 bg-[#203d11] text-white font-medium rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Tìm'}
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</div>}
      {loading && <div className="text-center py-8 text-[#203d11]/60">Đang tìm kiếm...</div>}
      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((user) => (
            <div
              key={user.user_id}
              className="flex items-center gap-3 p-3 bg-[#f5f0e8]/50 rounded-xl hover:bg-[#f5f0e8] transition-all"
            >
              <button
                onClick={() => router.push(`/users/${user.user_id}`)}
                className="flex-shrink-0"
              >
                <CachedAvatar
                  src={user.avatar_url}
                  alt={user.full_name || user.username}
                  fallbackText={user.full_name || user.username}
                  size="lg"
                />
              </button>
              <button
                onClick={() => router.push(`/users/${user.user_id}`)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-base font-bold text-[#203d11] truncate">{user.full_name}</p>
                <p className="text-sm text-[#203d11]/60 truncate">@{user.username}</p>
              </button>
              <button
                onClick={() =>
                  user.is_pending_received
                    ? handleAcceptRequest(user.user_id)
                    : handleSendRequest(user.user_id)
                }
                disabled={user.is_friend || user.is_pending_sent || sendingRequest === user.user_id}
                className={`px-4 py-2 min-h-[44px] rounded-xl text-sm font-medium transition-all whitespace-nowrap ${user.is_friend ? 'bg-[#203d11]/10 text-[#203d11] cursor-not-allowed' : user.is_pending_sent ? 'bg-[#975b1d]/10 text-[#975b1d] cursor-not-allowed' : user.is_pending_received ? 'bg-[#975b1d] text-white hover:bg-[#7a4a17]' : 'bg-[#203d11] text-white hover:bg-[#2a5016] disabled:opacity-50'}`}
              >
                {sendingRequest === user.user_id
                  ? user.is_pending_received
                    ? 'Đang chấp nhận...'
                    : 'Đang gửi...'
                  : user.is_friend
                    ? 'Bạn bè'
                    : user.is_pending_sent
                      ? 'Đã gửi lời mời'
                      : user.is_pending_received
                        ? 'Chấp nhận'
                        : 'Kết bạn'}
              </button>
            </div>
          ))}
        </div>
      )}
      {!loading && hasSearched && results.length === 0 && (
        <div className="text-center py-8 text-[#203d11]/60">
          Không tìm thấy người dùng nào phù hợp &quot;{query}&quot;
        </div>
      )}
      {!loading && !hasSearched && (
        <div className="text-center py-8 text-[#203d11]/50 text-sm">
          Nhập tên người dùng và nhấn Enter hoặc nhấp vào Tìm kiếm
        </div>
      )}
    </div>
  );
}
