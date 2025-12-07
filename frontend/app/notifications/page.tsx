'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotifications as getNotificationsApi,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
  deleteNotification as deleteNotificationApi,
  deleteAllNotifications as deleteAllNotificationsApi,
  Notification,
} from '@/lib/api/notifications';
import NotificationItem from '@/components/notifications/NotificationItem';

export default function NotificationsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadNotifications();
  }, [token, router]);

  const loadNotifications = async (isLoadMore = false) => {
    if (!token) return;
    try {
      isLoadMore ? setLoadingMore(true) : setLoading(true);
      const result = await getNotificationsApi(isLoadMore ? nextToken : undefined);
      isLoadMore
        ? setNotifications((prev) => [...prev, ...result.notifications])
        : setNotifications(result.notifications);
      if (result.unreadCount !== undefined) setUnreadCount(result.unreadCount);
      setNextToken(result.nextToken);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thông báo');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!token || notification.isRead) return;
    try {
      await markAsReadApi(notification.notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === notification.notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token) return;
    try {
      await markAllAsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!token) return;
    try {
      await deleteNotificationApi(notificationId);
      const deleted = notifications.find((n) => n.notificationId === notificationId);
      setNotifications((prev) => prev.filter((n) => n.notificationId !== notificationId));
      if (deleted && !deleted.isRead) setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleDeleteAll = async () => {
    if (!token || notifications.length === 0) return;
    if (!confirm('Bạn có chắc muốn xóa tất cả thông báo?')) return;
    try {
      await deleteAllNotificationsApi();
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to delete all notifications:', err);
    }
  };

  const filteredNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-8 px-4">
        <div className="max-w-[1200px] mx-auto flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]" />
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-6 sm:py-12 px-4 pb-20 lg:pb-8">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#203d11]">Thông báo</h1>
          <p className="text-sm sm:text-base text-[#203d11]/70 mt-1">
            {unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc` : 'Đã cập nhật tất cả!'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 mb-4 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex gap-2">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 sm:flex-none px-4 py-2 h-12 rounded-xl font-semibold text-sm transition-all ${filter === f ? 'bg-[#203d11] text-white' : 'bg-[#f5f0e8]/50 text-[#203d11] hover:bg-[#f5f0e8]'}`}
              >
                {f === 'all' ? 'Tất cả' : `Chưa đọc${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} className="text-sm text-[#975b1d] hover:text-[#203d11] font-semibold h-12 px-3 transition-colors">Đánh dấu đã đọc</button>
            )}
            {notifications.length > 0 && (
              <button onClick={handleDeleteAll} className="text-sm text-red-500 hover:text-red-700 font-semibold h-12 px-3 transition-colors">Xóa tất cả</button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 p-12 text-center">
            <div className="w-20 h-20 bg-[#f5f0e8] rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
              🔔
            </div>
            <h3 className="text-xl font-semibold text-[#203d11] mb-2">
              {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}
            </h3>
            <p className="text-[#203d11]/70">
              {filter === 'unread'
                ? 'Tất cả thông báo đã được đọc'
                : 'Bạn sẽ thấy thông báo ở đây khi có'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 overflow-hidden divide-y divide-[#203d11]/5">
            {filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.notificationId}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                onDelete={handleDelete}
              />
            ))}
            {nextToken && filter === 'all' && (
              <div className="p-4 text-center">
                <button
                  onClick={() => loadNotifications(true)}
                  disabled={loadingMore}
                  className="w-full sm:w-auto px-6 py-3 h-12 bg-[#f5f0e8]/50 text-[#203d11] rounded-xl border-2 border-transparent hover:border-[#975b1d] transition-all font-semibold disabled:opacity-50"
                >
                  {loadingMore ? 'Đang tải...' : 'Tải thêm'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
