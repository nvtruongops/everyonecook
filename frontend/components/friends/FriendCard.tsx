'use client';
import { useState } from 'react';
import Link from 'next/link';
import CachedAvatar from '@/components/ui/CachedAvatar';
import { Friend } from '@/services/friends';

interface Props {
  friend: Friend;
  onRemove: () => Promise<void>;
}

export default function FriendCard({ friend, onRemove }: Props) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    setLoading(true);
    setError(null);
    try {
      await onRemove();
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể hủy kết bạn');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition-all border border-[#203d11]/5">
      <Link
        href={`/users/${friend.userId}`}
        prefetch={false}
        className="flex items-center gap-3 sm:gap-4"
      >
        <CachedAvatar
          src={friend.avatarUrl}
          alt={friend.fullName || friend.username}
          fallbackText={friend.fullName || friend.username}
          size="xl"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-[#203d11] truncate hover:text-[#975b1d]">
            {friend.fullName}
          </h3>
          <p className="text-sm text-[#203d11]/60 truncate">@{friend.username}</p>
        </div>
      </Link>
      <div className="mt-3 flex justify-end">
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="text-sm text-red-600 hover:text-red-700 hover:underline min-h-[44px] px-3 transition-all"
          >
            Hủy kết bạn
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleRemove}
              disabled={loading}
              className="px-4 py-2 min-h-[44px] text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all"
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              className="px-4 py-2 min-h-[44px] text-sm bg-[#f5f0e8] text-[#203d11] rounded-xl hover:bg-[#203d11]/10 disabled:opacity-50 transition-all"
            >
              Hủy bỏ
            </button>
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-xl">{error}</div>}
    </div>
  );
}
