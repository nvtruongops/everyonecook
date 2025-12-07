'use client';
import Link from 'next/link';
import { Notification } from '@/lib/api/notifications';
import CachedAvatar from '@/components/ui/CachedAvatar';

interface Props {
  notification: Notification;
  onClick: () => void;
  onDelete?: (id: string) => void;
}

function NotificationIcon({ type }: { type: string }) {
  const iconClass = "w-3 h-3 text-[#203d11]";
  switch (type) {
    case 'friend': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case 'comment': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
    case 'heart': return <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>;
    case 'at': return <span className="text-xs font-bold text-[#203d11]">@</span>;
    case 'check': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
    case 'share': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>;
    case 'warning': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    case 'ban': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
    case 'eye': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
    case 'trash': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
    case 'x': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
    default: return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
  }
}

const iconTypes: Record<string, string> = {
  friend_request: 'friend',
  friend_accept: 'friend',
  friend_accepted: 'friend',
  comment: 'comment',
  new_comment: 'comment',
  reaction: 'heart',
  new_reaction: 'heart',
  mention: 'at',
  recipe_approved: 'check',
  post_shared: 'share',
  warning: 'warning',
  WARNING: 'warning',
  moderation: 'ban',
  POST_HIDDEN: 'eye',
  POST_HIDDEN_BAN: 'ban',
  COMMENT_HIDDEN: 'eye',
  COMMENT_HIDDEN_BAN: 'ban',
  POST_DELETED: 'trash',
  APPEAL_APPROVED: 'check',
  APPEAL_REJECTED: 'x',
  CONTENT_APPEAL_APPROVED: 'check',
};
const messages: Record<string, string> = {
  friend_request: 'đã gửi lời mời kết bạn',
  friend_accepted: 'đã chấp nhận lời mời kết bạn',
  new_comment: 'đã bình luận bài viết của bạn',
  comment: 'đã bình luận bài viết của bạn',
  comment_reply: 'đã trả lời bình luận của bạn',
  mention: 'đã nhắc đến bạn',
  new_reaction: 'đã thích bài viết của bạn',
  reaction: 'đã thích bài viết của bạn',
  post_shared: 'đã chia sẻ bài viết của bạn',
};

export default function NotificationItem({ notification, onClick, onDelete }: Props) {
  const formatDate = (d?: string) => {
    if (!d) return '';
    const date = new Date(d),
      now = new Date(),
      diff = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diff < 1) return 'Vừa xong';
    if (diff < 60) return `${diff} phút`;
    if (diff < 1440) return `${Math.floor(diff / 60)} giờ`;
    if (diff < 10080) return `${Math.floor(diff / 1440)} ngày`;
    return date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' });
  };

  const getUrl = () => {
    const { type, resourceId, metadata, actorId } = notification;
    const postId = metadata?.postId || resourceId;
    if (type === 'friend_request') return '/friends?tab=pending';
    if (type === 'friend_accepted') return `/users/${actorId}`;
    if (['new_reaction', 'reaction'].includes(type)) return postId ? `/post/${postId}` : '#';
    if (['new_comment', 'comment', 'mention'].includes(type))
      return postId ? `/post/${postId}?commentId=${resourceId}` : '#';
    if (type === 'post_shared')
      return metadata?.sharedPostId ? `/post/${metadata.sharedPostId}` : '#';
    return resourceId ? `/post/${resourceId}` : '#';
  };

  const adminTypes = [
    'warning',
    'moderation',
    'WARNING',
    'POST_HIDDEN',
    'POST_HIDDEN_BAN',
    'COMMENT_HIDDEN',
    'COMMENT_HIDDEN_BAN',
    'POST_DELETED',
    'APPEAL_APPROVED',
    'APPEAL_REJECTED',
    'CONTENT_APPEAL_APPROVED',
  ];
  const isAdminNotification = adminTypes.includes(notification.type);
  const isViolationNotification = ['POST_HIDDEN', 'POST_HIDDEN_BAN', 'COMMENT_HIDDEN', 'COMMENT_HIDDEN_BAN', 'WARNING'].includes(notification.type);
  
  const actorName = isAdminNotification
    ? notification.metadata?.adminUsername || (notification as any).adminUsername || 'Quản trị viên'
    : notification.actorName || notification.metadata?.actorName || 'Ai đó';
  const message =
    messages[notification.type] ||
    notification.message ||
    notification.metadata?.message ||
    'đã gửi thông báo';

  const handleClick = () => {
    onClick();
    // For violation notifications, go to violation detail page
    if (isViolationNotification) {
      const contentType = (notification as any).contentType || notification.metadata?.contentType;
      const contentId = (notification as any).contentId || notification.metadata?.contentId;
      const violationId = (notification as any).violationId || notification.metadata?.violationId;
      // Always use query params for violations page
      if (contentType && contentId) {
        const params = new URLSearchParams({ type: contentType, id: contentId });
        if (violationId) params.set('violationId', violationId);
        window.location.href = `/violations?${params}`;
        return;
      }
    }
    const url = getUrl();
    if (url !== '#') window.location.href = url;
  };

  // Violation/Admin notifications get special styling - dark border, no colored backgrounds
  if (isViolationNotification) {
    const canAppeal = (notification as any).canAppeal || notification.metadata?.canAppeal;
    
    return (
      <div
        className="relative flex flex-col gap-2 px-4 py-3 mx-2 my-1 rounded-lg border-2 border-[#203d11] bg-white hover:shadow-lg transition-all cursor-pointer group"
        onClick={handleClick}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#203d11]/10 border border-[#203d11]/30">
            <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#203d11]">
              {(notification as any).title || notification.metadata?.title || 'Thông báo từ quản trị viên'}
            </p>
            <p className="text-xs text-[#203d11]/80 mt-1 line-clamp-2">{message}</p>
            <p className="text-[10px] text-[#203d11]/50 mt-1">{formatDate(notification.createdAt)}</p>
          </div>
          {!notification.isRead && (
            <div className="w-2.5 h-2.5 rounded-full bg-[#203d11] flex-shrink-0" />
          )}
        </div>
        {canAppeal && (
          <div className="flex items-center justify-between pt-2 border-t border-[#203d11]/20">
            <span className="text-[10px] text-[#203d11]/60">Bạn có thể kháng cáo quyết định này</span>
            <span className="text-xs text-[#203d11] font-medium hover:underline">Xem chi tiết →</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative flex items-start gap-2 px-3 py-2 hover:bg-[#f5f0e8]/50 transition-all cursor-pointer group"
      onClick={handleClick}
    >
      <div className="flex-shrink-0 pt-2">
        <div
          className={`w-2 h-2 rounded-full ${notification.isRead ? 'bg-[#203d11]/20' : 'bg-[#203d11]'}`}
        />
      </div>
      <div className="relative flex-shrink-0">
        <CachedAvatar
          src={notification.actorAvatar}
          alt={actorName}
          fallbackText={actorName}
          size="sm"
        />
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#203d11]/10">
          <NotificationIcon type={iconTypes[notification.type] || 'bell'} />
        </div>
      </div>
      <div className="flex-1 min-w-0 pr-6">
        <p className="text-xs text-[#203d11] leading-snug">
          <Link
            href={`/users/${notification.actorId}`}
            prefetch={false}
            className="font-semibold hover:text-[#975b1d]"
            onClick={(e) => e.stopPropagation()}
          >
            {actorName}
          </Link>{' '}
          {message}
        </p>
        <p className="text-[10px] text-[#203d11]/50 mt-0.5">{formatDate(notification.createdAt)}</p>
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.notificationId);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#203d11]/30 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
          title="Xóa"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
