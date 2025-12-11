'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  Notification,
} from '@/lib/api/notifications';
import NotificationItem from './NotificationItem';

export default function NotificationDropdown() {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nextToken, setNextToken] = useState<string>();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Check mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const load = useCallback(
    async (more = false) => {
      if (!token) return;
      try {
        if (!more) setLoading(true);
        const result = await getNotifications(more ? nextToken : undefined);
        setNotifications((prev) =>
          more ? [...prev, ...result.notifications] : result.notifications
        );
        if (
          result.unreadCount !== undefined &&
          result.unreadCount > unreadCount &&
          unreadCount > 0
        ) {
          setIsAnimating(true);
          setTimeout(() => setIsAnimating(false), 2000);
        }
        if (result.unreadCount !== undefined) setUnreadCount(result.unreadCount);
        setNextToken(result.nextToken);
      } catch {
      } finally {
        setLoading(false);
      }
    },
    [token, nextToken, unreadCount]
  );

  useEffect(() => {
    if (token) {
      load();
      const i = setInterval(() => load(), 10000);
      return () => clearInterval(i);
    }
  }, [token]);
  useEffect(() => {
    if (unreadCount > 0) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 2000);
    }
  }, []);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [isOpen]);

  const handleClick = async (n: Notification) => {
    if (!token || n.isRead) return;
    try {
      await markAsRead(n.notificationId);
      setNotifications((prev) =>
        prev.map((x) => (x.notificationId === n.notificationId ? { ...x, isRead: true } : x))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };
  const handleMarkAll = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };
  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await deleteNotification(id);
      const n = notifications.find((x) => x.notificationId === id);
      setNotifications((prev) => prev.filter((x) => x.notificationId !== id));
      if (n && !n.isRead) setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };
  const handleDeleteAll = async () => {
    if (!token || !notifications.length) return;
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  if (!token) return null;

  return (
    <div className="relative overflow-visible" ref={dropdownRef} style={{ zIndex: 9999 }}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 text-[#203d11]/70 hover:text-[#203d11] hover:bg-[#f5f0e8] rounded-full transition-all ${isAnimating ? 'animate-bounce' : ''}`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div
          className="fixed bg-white rounded-2xl shadow-xl border border-[#203d11]/10 overflow-hidden flex flex-col"
          style={{
            zIndex: 99999,
            width: isMobile ? 'calc(100vw - 16px)' : '384px',
            right: isMobile ? '8px' : buttonRef.current
              ? `${window.innerWidth - buttonRef.current.getBoundingClientRect().right}px`
              : '8px',
            left: isMobile ? '8px' : 'auto',
            top: buttonRef.current
              ? `${buttonRef.current.getBoundingClientRect().bottom + 8}px`
              : '64px',
            maxHeight: isMobile ? 'calc(100vh - 140px)' : '520px',
          }}
        >
          <div className="px-4 py-3 border-b border-[#203d11]/10 flex items-center justify-between bg-[#f5f0e8]/50">
            <h3 className="text-base font-bold text-[#203d11]">Thông báo</h3>
            <button
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
              className={`text-xs font-medium ${unreadCount > 0 ? 'text-[#975b1d] hover:text-[#203d11]' : 'text-[#203d11]/30 cursor-not-allowed'}`}
            >
              Đánh dấu đã đọc
            </button>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: '420px' }}>
            {loading && !notifications.length ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#203d11]" />
              </div>
            ) : !notifications.length ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <svg className="w-8 h-8 text-[#203d11]/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-[#203d11]/50 text-sm">Chưa có thông báo</p>
              </div>
            ) : (
              <div className="divide-y divide-[#203d11]/5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.notificationId}
                    notification={n}
                    onClick={() => handleClick(n)}
                    onDelete={handleDelete}
                  />
                ))}
                {nextToken && (
                  <div className="p-2 text-center">
                    <button
                      onClick={() => load(true)}
                      disabled={loading}
                      className="text-xs text-[#975b1d] hover:text-[#203d11] font-medium disabled:opacity-50"
                    >
                      {loading ? 'Đang tải...' : 'Xem thêm'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="px-3 py-2 border-t border-[#203d11]/10 bg-[#f5f0e8]/50">
              <button
                onClick={handleDeleteAll}
                className="w-full text-xs text-red-600 hover:text-red-700 font-medium flex items-center justify-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Xóa toàn bộ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
