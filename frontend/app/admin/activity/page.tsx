'use client';

import { useState, useEffect } from 'react';
import { getAdminToken } from '@/lib/adminAuth';
import { getActivity, archiveActivity, ActivityLog } from '@/services/admin';
import Toast from '@/components/ui/Toast';

const ITEMS_PER_PAGE = 10;

// Activity type configuration - grouped by category
const activityTypeConfig: Record<string, { label: string; color: string; category: string }> = {
  // User actions
  BAN_USER: { label: 'Khóa tài khoản', color: 'bg-red-600', category: 'user' },
  UNBAN_USER: { label: 'Mở khóa tài khoản', color: 'bg-[#203d11]', category: 'user' },
  DELETE_USER_CASCADE: { label: 'Xóa tài khoản', color: 'bg-[#975b1d]', category: 'user' },
  WARN_USER: { label: 'Cảnh báo người dùng', color: 'bg-yellow-600', category: 'user' },
  // Post actions
  DELETE_POST: { label: 'Xóa bài viết', color: 'bg-red-600', category: 'post' },
  HIDE_POST: { label: 'Ẩn bài viết', color: 'bg-orange-600', category: 'post' },
  RESTORE_POST: { label: 'Khôi phục bài viết', color: 'bg-[#203d11]', category: 'post' },
  RESTORE_CONTENT: { label: 'Khôi phục nội dung', color: 'bg-[#203d11]', category: 'post' },
  DISMISS: { label: 'Bỏ qua báo cáo', color: 'bg-gray-500', category: 'post' },
  // Comment actions
  DELETE_COMMENT: { label: 'Xóa bình luận', color: 'bg-red-600', category: 'comment' },
  HIDE_COMMENT: { label: 'Ẩn bình luận', color: 'bg-orange-600', category: 'comment' },
  RESTORE_COMMENT: { label: 'Khôi phục bình luận', color: 'bg-[#203d11]', category: 'comment' },
  COMMENT_WARN: { label: 'Cảnh báo (bình luận)', color: 'bg-yellow-600', category: 'comment' },
  COMMENT_HIDE_COMMENT: { label: 'Ẩn bình luận', color: 'bg-orange-600', category: 'comment' },
  COMMENT_BAN_USER: { label: 'Khóa user (bình luận)', color: 'bg-red-600', category: 'comment' },
  COMMENT_DISMISS: { label: 'Bỏ qua (bình luận)', color: 'bg-gray-500', category: 'comment' },
  // Appeal actions
  APPROVE_APPEAL: { label: 'Chấp nhận kháng cáo', color: 'bg-[#203d11]', category: 'appeal' },
  REJECT_APPEAL: { label: 'Từ chối kháng cáo', color: 'bg-red-600', category: 'appeal' },
  // Archive actions
  ARCHIVE_REPORTS: { label: 'Giải phóng reports', color: 'bg-blue-600', category: 'system' },
  ARCHIVE_ACTIVITY: { label: 'Giải phóng activity', color: 'bg-blue-600', category: 'system' },
};



function formatMetadata(activity: ActivityLog): JSX.Element | null {
  const metadata = activity.metadata;
  if (!metadata || Object.keys(metadata).length === 0) return null;

  if (activity.actionType === 'DELETE_USER_CASCADE' && metadata.stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-[#975b1d]">P</span>
          <span>Bài viết: <strong className="text-[#203d11]">{metadata.stats.postsDeleted || 0}</strong></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#975b1d]">C</span>
          <span>Bình luận: <strong className="text-[#203d11]">{metadata.stats.commentsDeleted || 0}</strong></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#975b1d]">F</span>
          <span>Tệp tin: <strong className="text-[#203d11]">{metadata.stats.filesDeleted || 0}</strong></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#975b1d]">T</span>
          <span>Tổng: <strong className="text-[#203d11]">{metadata.stats.totalItemsDeleted || 0}</strong></span>
        </div>
      </div>
    );
  }

  if (activity.actionType === 'BAN_USER') {
    const banType = metadata.banType === 'permanent' ? 'Vĩnh viễn' : 'Tạm thời';
    const duration = metadata.banDuration;
    return (
      <div className="flex flex-wrap gap-3 text-sm">
        <span>Loại khóa: <strong className="text-[#203d11]">{banType}</strong></span>
        {duration > 0 && <span>Thời hạn: <strong className="text-[#203d11]">{duration} ngày</strong></span>}
      </div>
    );
  }

  if (activity.actionType === 'UNBAN_USER') {
    const source = metadata.source === 'manual' ? 'Thủ công' : metadata.source === 'appeal' ? 'Kháng cáo' : metadata.source;
    return <span className="text-sm">Nguồn: <strong className="text-[#203d11]">{source}</strong></span>;
  }

  if (activity.actionType === 'DELETE_POST' || activity.actionType === 'RESTORE_POST') {
    return metadata.postId ? (
      <span className="text-sm">ID bài viết: <strong className="text-[#203d11] font-mono text-xs">{metadata.postId}</strong></span>
    ) : null;
  }

  return null;
}

export default function AdminActivityPage() {
  const [loading, setLoading] = useState(true);
  const [allActivities, setAllActivities] = useState<ActivityLog[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [lastKey, setLastKey] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleArchive() {
    setShowConfirm(false);
    
    try {
      setArchiving(true);
      const token = await getAdminToken();
      if (!token) return;
      
      const result = await archiveActivity(token);
      
      // Reload activities after archive
      await loadActivities();
      
      setToast({ 
        message: `${result.message} (${result.archivedCount} records → S3)`, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Archive failed:', error);
      setToast({ 
        message: 'Lỗi khi archive: ' + (error instanceof Error ? error.message : 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setArchiving(false);
    }
  }

  async function loadActivities(reset = true) {
    try {
      if (reset) {
        setLoading(true);
        setAllActivities([]);
        setCurrentPage(1);
      }

      const token = await getAdminToken();
      if (!token) return;

      const response = await getActivity(token, {
        limit: 100,
        lastKey: reset ? undefined : lastKey,
      });

      if (reset) {
        setAllActivities(response.activities);
      } else {
        setAllActivities((prev) => [...prev, ...response.activities]);
      }
      setHasMore(response.hasMore);
      setLastKey(response.lastKey);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadMoreFromAPI() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await loadActivities(false);
  }

  useEffect(() => {
    loadActivities();
  }, []);

  const totalPages = Math.ceil(allActivities.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentActivities = allActivities.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage === totalPages && hasMore && !loadingMore) {
      loadMoreFromAPI();
    }
  }, [currentPage, totalPages, hasMore]);

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  }

  function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  }

  function getActivityDescription(activity: ActivityLog): string {
    const admin = activity.adminUsername || 'Admin';
    const target = activity.targetUsername ? `@${activity.targetUsername}` : (activity.targetUserId || '');

    switch (activity.actionType) {
      // User actions
      case 'BAN_USER': return `${admin} đã khóa tài khoản ${target}`;
      case 'UNBAN_USER': return `${admin} đã mở khóa tài khoản ${target}`;
      case 'DELETE_USER_CASCADE': return `${admin} đã xóa vĩnh viễn tài khoản ${target}`;
      case 'WARN_USER': return `${admin} đã gửi cảnh báo cho ${target}`;
      // Post actions
      case 'DELETE_POST': return `${admin} đã xóa bài viết của ${target}`;
      case 'HIDE_POST': return `${admin} đã ẩn bài viết của ${target}`;
      case 'RESTORE_POST': return `${admin} đã khôi phục bài viết của ${target}`;
      case 'RESTORE_CONTENT': return `${admin} đã khôi phục nội dung của ${target}`;
      case 'DISMISS': return `${admin} đã bỏ qua báo cáo`;
      // Comment actions
      case 'DELETE_COMMENT': return `${admin} đã xóa bình luận của ${target}`;
      case 'HIDE_COMMENT': return `${admin} đã ẩn bình luận của ${target}`;
      case 'RESTORE_COMMENT': return `${admin} đã khôi phục bình luận của ${target}`;
      case 'COMMENT_WARN': return `${admin} đã cảnh báo ${target} về bình luận`;
      case 'COMMENT_HIDE_COMMENT': return `${admin} đã ẩn bình luận của ${target}`;
      case 'COMMENT_BAN_USER': return `${admin} đã khóa ${target} do bình luận vi phạm`;
      case 'COMMENT_DISMISS': return `${admin} đã bỏ qua báo cáo bình luận`;
      // Appeal actions
      case 'APPROVE_APPEAL': return `${admin} đã chấp nhận kháng cáo của ${target}`;
      case 'REJECT_APPEAL': return `${admin} đã từ chối kháng cáo của ${target}`;
      // Archive actions
      case 'ARCHIVE_REPORTS': return `${admin} đã giải phóng reports (${activity.metadata?.archivedCount || 0} records)`;
      case 'ARCHIVE_ACTIVITY': return `${admin} đã giải phóng activity logs (${activity.metadata?.archivedCount || 0} records)`;
      default: 
        const config = activityTypeConfig[activity.actionType];
        return config ? `${admin} - ${config.label}${target ? ` (${target})` : ''}` : `${admin} thực hiện ${activity.actionType}`;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-[#203d11]">Nhật ký hoạt động</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={archiving || allActivities.length === 0}
            className="px-5 py-2.5 bg-[#975b1d] text-white rounded-xl hover:bg-[#7a4a17] flex items-center gap-2 transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {archiving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Đang giải phóng...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Giải phóng
              </>
            )}
          </button>
          <button
            onClick={() => loadActivities()}
            className="px-5 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] flex items-center gap-2 transition-colors duration-200 font-medium"
          >
            Làm mới
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-[#203d11] mb-3">Xác nhận giải phóng</h3>
            <p className="text-[#203d11]/70 mb-4">
              Bạn có chắc muốn giải phóng tất cả {allActivities.length} activity logs?
              <br /><br />
              Dữ liệu sẽ được lưu vào S3 và xóa khỏi database.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleArchive}
                className="px-4 py-2 bg-[#975b1d] text-white rounded-xl hover:bg-[#7a4a17] transition-colors"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={5000}
        />
      )}



      {/* Activity List */}
      <div className="bg-white rounded-xl shadow-sm border border-[#203d11]/10">
        <div className="divide-y divide-[#203d11]/10">
          {currentActivities.length === 0 ? (
            <div className="p-12 text-center text-[#203d11]/60">
              <div className="w-16 h-16 bg-[#f5f0e8] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-[#203d11]/40">H</span>
              </div>
              <p className="font-medium">Chưa có hoạt động nào</p>
              <p className="text-sm mt-1">Các hoạt động quản trị sẽ hiển thị ở đây</p>
            </div>
          ) : (
            currentActivities.map((activity) => {
              const config = activityTypeConfig[activity.actionType] || { label: activity.actionType, color: 'bg-[#975b1d]' };

              return (
                <div key={activity.activityId} className="p-4 hover:bg-[#f5f0e8]/50 transition-colors duration-200">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {config.label.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium text-white ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-xs text-[#975b1d] font-medium">
                          {formatTimeAgo(activity.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-[#203d11] font-medium mb-2">
                        {getActivityDescription(activity)}
                      </p>

                      {activity.targetUsername && (
                        <div className="text-sm mb-2 text-[#203d11]/70">
                          Tài khoản: <strong>@{activity.targetUsername}</strong>
                        </div>
                      )}

                      {activity.reason && (
                        <div className="text-sm mb-2 text-[#203d11]/70">
                          Lý do: <strong>{activity.reason}</strong>
                        </div>
                      )}

                      {formatMetadata(activity) && (
                        <div className="mt-2 text-[#203d11]/70 bg-[#f5f0e8] p-3 rounded-xl">
                          {formatMetadata(activity)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#203d11]/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-[#203d11] font-medium">
              Trang {currentPage} / {totalPages} ({allActivities.length} hoạt động)
              {loadingMore && <span className="ml-2 text-[#975b1d]">Đang tải thêm...</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-[#203d11]/20 text-sm text-[#203d11] disabled:opacity-40 hover:bg-[#f5f0e8] transition-colors duration-200"
              >
                ««
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-[#203d11]/20 text-sm text-[#203d11] disabled:opacity-40 hover:bg-[#f5f0e8] transition-colors duration-200"
              >
                «
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                      currentPage === pageNum
                        ? 'bg-[#203d11] text-white'
                        : 'border border-[#203d11]/20 text-[#203d11] hover:bg-[#f5f0e8]'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#203d11]/20 text-sm text-[#203d11] disabled:opacity-40 hover:bg-[#f5f0e8] transition-colors duration-200"
              >
                »
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#203d11]/20 text-sm text-[#203d11] disabled:opacity-40 hover:bg-[#f5f0e8] transition-colors duration-200"
              >
                »»
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
