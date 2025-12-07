'use client';
import { useState } from 'react';
import { Friend } from '@/services/friends';
import CachedAvatar from '@/components/ui/CachedAvatar';

interface Props {
  blockedUser: Friend;
  onUnblock: () => Promise<void>;
}

export default function BlockedUserCard({ blockedUser, onUnblock }: Props) {
  const [loading, setLoading] = useState(false);

  const handleUnblock = async () => {
    setLoading(true);
    try {
      await onUnblock();
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between gap-4 border border-[#203d11]/5">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <CachedAvatar
          src={blockedUser.avatarUrl}
          alt={blockedUser.fullName || blockedUser.username}
          fallbackText={blockedUser.fullName || blockedUser.username}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#203d11] truncate">{blockedUser.fullName}</h3>
          <p className="text-sm text-[#203d11]/60 truncate">@{blockedUser.username}</p>
        </div>
      </div>
      <button
        onClick={handleUnblock}
        disabled={loading}
        className="px-4 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition-all min-h-[44px] flex-shrink-0"
      >
        {loading ? 'Đang bỏ chặn...' : 'Bỏ chặn'}
      </button>
    </div>
  );
}
