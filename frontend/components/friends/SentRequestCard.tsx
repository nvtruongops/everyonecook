'use client';
import Link from 'next/link';
import CachedAvatar from '@/components/ui/CachedAvatar';
import { FriendRequest } from '@/services/friends';

interface Props {
  request: FriendRequest;
  onCancel: () => void;
  loading?: boolean;
}

export default function SentRequestCard({ request, onCancel, loading }: Props) {
  const formatDate = (d: string) => {
    const date = new Date(d),
      now = new Date(),
      diff = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diff < 60) return `${diff} phút trước`;
    if (diff < 1440) return `${Math.floor(diff / 60)} giờ trước`;
    if (diff < 2880) return 'Hôm qua';
    if (diff < 10080) return `${Math.floor(diff / 1440)} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#203d11]/5 p-5 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <Link href={`/users/${request.fromUserId}`} prefetch={false} className="flex-shrink-0">
          <CachedAvatar
            src={request.fromAvatarUrl}
            alt={request.fromFullName}
            fallbackText={request.fromUsername?.charAt(0) || 'U'}
            size="lg"
            className="ring-2 ring-[#975b1d]/30 hover:ring-[#975b1d] transition-all"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            href={`/users/${request.fromUserId}`}
            prefetch={false}
            className="font-bold text-[#203d11] hover:text-[#975b1d] transition-all truncate block"
          >
            {request.fromFullName}
          </Link>
          <p className="text-sm text-[#203d11]/60 truncate">@{request.fromUsername}</p>
          <p className="text-xs text-[#975b1d]/70 mt-1">Đã gửi {formatDate(request.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-[#975b1d]/10 text-[#975b1d] rounded-xl text-xs font-medium">
            Đang chờ
          </span>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 min-h-[44px] bg-[#f5f0e8] text-[#203d11] rounded-xl hover:bg-[#203d11]/10 disabled:opacity-50 transition-all text-sm font-medium"
          >
            {loading ? 'Đang hủy...' : 'Hủy lời mời'}
          </button>
        </div>
      </div>
    </div>
  );
}
