'use client';
import { useState } from 'react';
import Link from 'next/link';
import CachedAvatar from '@/components/ui/CachedAvatar';
import { FriendRequest } from '@/services/friends';

interface Props {
  request: FriendRequest;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onBlock?: () => Promise<void>;
}

export default function FriendRequestCard({ request, onAccept, onReject, onBlock }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (fn: () => Promise<void>, errMsg: string) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-[#203d11]/5">
      <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-0">
        <Link href={`/users/${request.fromUserId}`} prefetch={false} className="flex-shrink-0">
          <CachedAvatar
            src={request.fromAvatarUrl}
            alt={request.fromFullName || request.fromUsername}
            fallbackText={request.fromFullName || request.fromUsername}
            size="xl"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            href={`/users/${request.fromUserId}`}
            prefetch={false}
            className="hover:text-[#975b1d]"
          >
            <h3 className="text-base sm:text-lg font-bold text-[#203d11] truncate">
              {request.fromFullName}
            </h3>
          </Link>
          <Link href={`/users/${request.fromUserId}`} prefetch={false}>
            <p className="text-sm text-[#203d11]/60 truncate">@{request.fromUsername}</p>
          </Link>
          <p className="text-xs text-[#203d11]/40 mt-1">
            {new Date(request.createdAt).toLocaleDateString('vi-VN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 sm:mt-0 sm:ml-auto sm:flex-shrink-0">
        <button
          onClick={() => handle(onAccept, 'Không thể chấp nhận')}
          disabled={loading}
          className="flex-1 sm:flex-none px-4 py-2 min-h-[44px] bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition-all text-sm font-medium"
        >
          {loading ? 'Đang xử lý...' : 'Chấp nhận'}
        </button>
        <button
          onClick={() => handle(onReject, 'Không thể từ chối')}
          disabled={loading}
          className="flex-1 sm:flex-none px-4 py-2 min-h-[44px] bg-[#f5f0e8] text-[#203d11] rounded-xl hover:bg-[#203d11]/10 disabled:opacity-50 transition-all text-sm font-medium"
        >
          Từ chối
        </button>
        {onBlock && (
          <button
            onClick={() => handle(onBlock, 'Không thể chặn')}
            disabled={loading}
            className="flex-1 sm:flex-none px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all text-sm font-medium"
          >
            Chặn
          </button>
        )}
      </div>
      {error && <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-xl">{error}</div>}
    </div>
  );
}
