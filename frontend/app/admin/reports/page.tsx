'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminRoute from '@/components/AdminRoute';
import { getAdminToken } from '@/lib/adminAuth';
import {
  getReportedPosts,
  getPostDetail,
  takeAction,
  getReportedComments,
  getCommentDetail,
  takeCommentAction,
  archiveReports,
  Report,
  PostDetailResponse,
  CommentReport,
  CommentDetailResponse,
  ModerationAction,
  CommentModerationAction,
  BanDurationUnit,
} from '@/services/admin';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Quấy rối',
  inappropriate: 'Nội dung không phù hợp',
  misinformation: 'Thông tin sai lệch',
  other: 'Khác',
};

const ACTION_LABELS: Record<string, string> = {
  dismiss: 'Bỏ qua',
  dismissed: 'Đã bỏ qua',
  warn: 'Cảnh báo',
  hide_post: 'Ẩn bài viết',
  hide_comment: 'Ẩn bình luận',
  ban_user: 'Khóa tài khoản',
  action_taken: 'Đã xử lý',
};

// Note: Không có delete_post/delete_comment vì dùng hide + TTL 7 ngày tự động xóa
const PRESET_REASONS: Record<string, string[]> = {
  dismiss: ['Báo cáo không hợp lệ', 'Nội dung không vi phạm', 'Báo cáo trùng lặp'],
  warn: ['Vi phạm quy tắc cộng đồng', 'Nội dung không phù hợp', 'Ngôn ngữ thiếu văn hóa', 'Spam hoặc quảng cáo'],
  hide_post: ['Vi phạm nghiêm trọng quy tắc cộng đồng', 'Nội dung gây hiểu lầm', 'Nội dung nhạy cảm', 'Chờ xem xét thêm'],
  hide_comment: ['Bình luận vi phạm quy tắc', 'Ngôn ngữ thù địch', 'Spam', 'Quấy rối người dùng khác'],
  ban_user: ['Vi phạm nhiều lần', 'Hành vi quấy rối nghiêm trọng', 'Spam liên tục', 'Tài khoản giả mạo', 'Hoạt động bất hợp pháp'],
};

type ReportType = 'all' | 'post' | 'comment';

export default function AdminReportsPage() {
  return (
    <AdminRoute>
      <ReportsContent />
    </AdminRoute>
  );
}

function ReportsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [postReports, setPostReports] = useState<any[]>([]);
  const [commentReports, setCommentReports] = useState<CommentReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<ReportType>('all');

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [selectedReportStatus, setSelectedReportStatus] = useState<string>('pending');
  const [postDetail, setPostDetail] = useState<PostDetailResponse | null>(null);
  const [commentDetail, setCommentDetail] = useState<CommentDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const REPORTS_PER_PAGE = 10;

  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionType, setActionType] = useState<'post' | 'comment'>('post');
  const [actionForm, setActionForm] = useState({
    action: '' as ModerationAction | CommentModerationAction,
    reason: '',
    banDuration: 7,
    banDurationUnit: 'days' as BanDurationUnit,
    notifyUser: true,
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Count processed reports (action_taken or dismissed)
  const processedCount = postReports.filter(r => r.status === 'action_taken' || r.status === 'dismissed').length +
    commentReports.filter(r => r.status === 'action_taken' || r.status === 'dismissed').length;

  async function handleArchive() {
    if (!token) return;
    setShowArchiveConfirm(false);
    
    try {
      setArchiving(true);
      const result = await archiveReports(token);
      await loadReports();
      showToast(`${result.message} (${result.archivedCount} records → S3)`, 'success');
    } catch (error) {
      showToast('Lỗi khi archive: ' + (error as Error).message, 'error');
    } finally {
      setArchiving(false);
    }
  }

  useEffect(() => {
    loadToken();
  }, []);

  useEffect(() => {
    if (token) loadReports();
  }, [token]);

  async function loadToken() {
    const adminToken = await getAdminToken();
    setToken(adminToken);
  }

  async function loadReports() {
    if (!token) return;
    try {
      setLoading(true);
      const [postsData, commentsData] = await Promise.all([
        getReportedPosts(token, { limit: 50 }),
        getReportedComments(token, { limit: 50 }),
      ]);
      setPostReports(postsData.reports || []);
      setCommentReports(commentsData.reports || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewPost(postId: string, reportStatus: string = 'pending') {
    if (!token) return;
    setSelectedPostId(postId);
    setSelectedCommentId(null);
    setSelectedReportStatus(reportStatus);
    setLoadingDetail(true);
    setReportPage(1);
    try {
      const detail = await getPostDetail(postId, token);
      setPostDetail(detail);
      setCommentDetail(null);
    } catch (error) {
      showToast('Không thể tải chi tiết bài viết', 'error');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleViewComment(commentId: string, reportStatus: string = 'pending') {
    if (!token) return;
    setSelectedCommentId(commentId);
    setSelectedPostId(null);
    setSelectedReportStatus(reportStatus);
    setLoadingDetail(true);
    setReportPage(1);
    try {
      const detail = await getCommentDetail(commentId, token);
      setCommentDetail(detail);
      setPostDetail(null);
    } catch (error) {
      showToast('Không thể tải chi tiết bình luận', 'error');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleTakeAction() {
    if (!token || !actionForm.action) return;
    setProcessing(true);
    try {
      if (actionType === 'post' && selectedPostId) {
        await takeAction(selectedPostId, {
          action: actionForm.action as ModerationAction,
          reason: actionForm.reason,
          banDuration: actionForm.action === 'ban_user' ? actionForm.banDuration : undefined,
          banDurationUnit: actionForm.action === 'ban_user' ? actionForm.banDurationUnit : undefined,
          notifyUser: actionForm.notifyUser,
        }, token);
      } else if (actionType === 'comment' && selectedCommentId) {
        await takeCommentAction(selectedCommentId, {
          action: actionForm.action as CommentModerationAction,
          reason: actionForm.reason,
          banDuration: actionForm.action === 'ban_user' ? actionForm.banDuration : undefined,
          banDurationUnit: actionForm.action === 'ban_user' ? actionForm.banDurationUnit : undefined,
          notifyUser: actionForm.notifyUser,
        }, token);
      }
      showToast('Đã xử lý thành công!', 'success');
      closeAllModals();
      loadReports();
    } catch (error) {
      showToast('Lỗi: ' + (error as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  }

  function closeAllModals() {
    setShowActionDialog(false);
    setSelectedPostId(null);
    setSelectedCommentId(null);
    setPostDetail(null);
    setCommentDetail(null);
    setActionForm({ action: '' as ModerationAction, reason: '', banDuration: 7, banDurationUnit: 'days', notifyUser: true });
  }

  function openActionDialog(action: ModerationAction | CommentModerationAction, type: 'post' | 'comment') {
    setActionType(type);
    setActionForm({ ...actionForm, action });
    setShowActionDialog(true);
  }

  const filteredPostReports = statusFilter === 'all' ? postReports :
    statusFilter === 'action_taken' ? postReports.filter((r) => r.status === 'action_taken' || r.status === 'dismissed') :
    postReports.filter((r) => r.status === statusFilter);

  const filteredCommentReports = statusFilter === 'all' ? commentReports :
    statusFilter === 'action_taken' ? commentReports.filter((r) => r.status === 'action_taken' || r.status === 'dismissed') :
    commentReports.filter((r) => r.status === statusFilter);

  const allReports = [
    ...filteredPostReports.map((r) => ({ ...r, type: 'post' as const })),
    ...filteredCommentReports.map((r) => ({ ...r, type: 'comment' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const displayReports = typeFilter === 'all' ? allReports : allReports.filter((r) => r.type === typeFilter);

  const totalPosts = postReports.length;
  const totalComments = commentReports.length;
  const pendingCount = postReports.filter((r) => r.status === 'pending').length + commentReports.filter((r) => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100]">
          <div className={`px-5 py-3 rounded-xl shadow-lg text-white font-medium ${toast.type === 'success' ? 'bg-[#203d11]' : 'bg-red-600'}`}>
            {toast.type === 'success' ? '✓' : '×'} {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-[#203d11] hover:text-[#975b1d] font-medium transition-colors duration-200">
            ← Quay lại
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-[#203d11]">Báo cáo & Kháng cáo</h1>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => processedCount > 0 ? setShowArchiveConfirm(true) : showToast('Không có reports đã xử lý để archive', 'error')}
            disabled={archiving || processedCount === 0}
            className="px-5 py-2.5 bg-[#975b1d] text-white rounded-xl hover:bg-[#7a4a17] font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                Giải phóng ({processedCount})
              </>
            )}
          </button>
          <button onClick={loadReports} className="px-5 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] font-medium transition-colors duration-200">
            Làm mới
          </button>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-[#203d11] mb-3">Xác nhận giải phóng</h3>
            <p className="text-[#203d11]/70 mb-4">
              Bạn có chắc muốn giải phóng {processedCount} reports đã xử lý?
              <br /><br />
              Dữ liệu sẽ được lưu vào S3 và xóa khỏi database.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowArchiveConfirm(false)}
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

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-3 rounded-xl bg-[#203d11] text-white flex items-center gap-2">
          <span className="font-bold text-lg">{totalPosts + totalComments}</span>
          <span className="text-sm opacity-90">Tổng</span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-[#203d11]/80 text-white flex items-center gap-2">
          <span className="font-bold text-lg">{totalPosts}</span>
          <span className="text-sm opacity-90">Bài viết</span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-[#975b1d] text-white flex items-center gap-2">
          <span className="font-bold text-lg">{totalComments}</span>
          <span className="text-sm opacity-90">Bình luận</span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-red-600 text-white flex items-center gap-2">
          <span className="font-bold text-lg">{pendingCount}</span>
          <span className="text-sm opacity-90">Chờ xử lý</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-[#203d11]/10">
        <div className="flex flex-col md:flex-row gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-[#203d11]">Loại báo cáo</label>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'Tất cả' },
                { value: 'post', label: 'Bài viết' },
                { value: 'comment', label: 'Bình luận' },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setTypeFilter(type.value as ReportType)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    typeFilter === type.value ? 'bg-[#203d11] text-white' : 'bg-[#f5f0e8] text-[#203d11] hover:bg-[#203d11]/10'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-[#203d11]">Trạng thái</label>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'Tất cả' },
                { value: 'pending', label: 'Chờ xử lý' },
                { value: 'action_taken', label: 'Đã xử lý' },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatusFilter(s.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    statusFilter === s.value ? 'bg-[#975b1d] text-white' : 'bg-[#f5f0e8] text-[#975b1d] hover:bg-[#975b1d]/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-[#203d11]/10">
        {displayReports.length === 0 ? (
          <div className="p-12 text-center text-[#203d11]/60">
            <div className="w-16 h-16 bg-[#f5f0e8] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-[#203d11]/40">R</span>
            </div>
            <p>Không có báo cáo nào</p>
          </div>
        ) : (
          <div className="divide-y divide-[#203d11]/10">
            {displayReports.map((report) => (
              <div key={report.reportId} className="p-4 hover:bg-[#f5f0e8]/50 transition-colors duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${report.type === 'post' ? 'bg-[#203d11]' : 'bg-[#975b1d]'}`}>
                        {report.type === 'post' ? 'Bài viết' : 'Bình luận'}
                      </span>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${report.status === 'pending' ? 'bg-red-100 text-red-800' : 'bg-[#203d11]/10 text-[#203d11]'}`}>
                        {report.status === 'pending' ? 'Chờ xử lý' : 'Đã xử lý'}
                      </span>
                      {report.reportCount > 1 && (
                        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[#975b1d]/10 text-[#975b1d]">
                          {report.reportCount} báo cáo
                        </span>
                      )}
                    </div>
                    <p className="text-sm mb-1 text-[#203d11] line-clamp-2">
                      {report.preview || report.description || report.commentContent?.substring(0, 100) || 'Không có mô tả'}
                    </p>
                    <p className="text-xs text-[#203d11]/60">
                      Tác giả: @{report.authorUsername || report.commentAuthorUsername || 'Unknown'} • {new Date(report.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <button
                    onClick={() => report.type === 'post' ? handleViewPost(report.postId, report.status) : handleViewComment(report.commentId, report.status)}
                    className="px-4 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] text-sm font-medium transition-colors duration-200 flex-shrink-0"
                  >
                    Xem chi tiết
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Post Detail Modal */}
      {selectedPostId && postDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            {loadingDetail ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11] mx-auto"></div>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#203d11]/10">
                  <h2 className="text-xl font-bold text-[#203d11]">Chi tiết bài viết bị báo cáo</h2>
                  <button onClick={closeAllModals} className="text-2xl text-[#203d11]/60 hover:text-[#203d11] transition-colors duration-200">×</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Post Content */}
                  <div>
                    <h3 className="font-semibold mb-3 text-[#203d11]">Nội dung bài viết</h3>
                    <div className="rounded-xl p-4 border-2 border-[#203d11]/20 bg-[#f5f0e8]/50">
                      <div className="flex items-center gap-3 mb-4">
                        {postDetail.post.authorAvatarUrl ? (
                          <img src={postDetail.post.authorAvatarUrl} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#203d11] flex items-center justify-center text-white font-medium">
                            {postDetail.post.authorUsername?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-[#203d11]">@{postDetail.post.authorUsername}</p>
                          <p className="text-xs text-[#203d11]/60">{new Date(postDetail.post.createdAt).toLocaleString('vi-VN')}</p>
                        </div>
                      </div>
                      {postDetail.post.title && <h4 className="font-semibold mb-2 text-[#203d11]">{postDetail.post.title}</h4>}
                      <p className="text-[#203d11]">{postDetail.post.caption}</p>
                      {postDetail.post.imageUrls?.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          {postDetail.post.imageUrls.slice(0, 4).map((url, idx) => (
                            <img key={idx} src={url} alt="" className="rounded-lg w-full h-32 object-cover" />
                          ))}
                        </div>
                      )}
                      <div className="flex gap-4 mt-4 text-sm text-[#203d11]/60">
                        <span>Likes: {postDetail.post.likeCount}</span>
                        <span>Comments: {postDetail.post.commentCount}</span>
                        <span className="text-red-600">Reports: {postDetail.post.reportCount}</span>
                      </div>
                      <a href={`/post/${postDetail.post.postId}`} target="_blank" rel="noopener noreferrer"
                        className="mt-4 inline-block px-4 py-2 bg-[#975b1d] text-white rounded-xl text-sm hover:bg-[#7a4917] transition-colors duration-200">
                        Đi đến bài viết
                      </a>
                    </div>

                    {postDetail.author && (
                      <div className="mt-4">
                        <h3 className="font-semibold mb-3 text-[#203d11]">Thông tin tác giả</h3>
                        <div className="rounded-xl p-4 border border-[#975b1d]/30 bg-[#975b1d]/5">
                          <p className="text-[#203d11]"><strong>Username:</strong> @{postDetail.author.username}</p>
                          <p className="text-[#203d11]"><strong>Email:</strong> {postDetail.author.email}</p>
                          <p className="text-[#203d11]"><strong>Trạng thái:</strong> {postDetail.author.isBanned ? <span className="text-red-600 font-medium">Đã bị khóa</span> : <span className="text-[#203d11] font-medium">Hoạt động</span>}</p>
                          <p className="text-[#203d11]"><strong>Số vi phạm:</strong> {postDetail.author.violationCount}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reports List */}
                  <div>
                    <h3 className="font-semibold mb-3 text-[#203d11]">Danh sách báo cáo ({postDetail.reports.length})</h3>
                    <div className="border border-[#203d11]/20 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-[#203d11]">
                          <tr>
                            <th className="px-3 py-2 text-left text-white text-sm">Người báo cáo</th>
                            <th className="px-3 py-2 text-left text-white text-sm">Lý do</th>
                            <th className="px-3 py-2 text-left text-white text-sm">Thời gian</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#203d11]/10">
                          {postDetail.reports.slice((reportPage - 1) * REPORTS_PER_PAGE, reportPage * REPORTS_PER_PAGE).map((report, idx) => (
                            <tr key={report.reportId} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f5f0e8]/30'}>
                              <td className="px-3 py-2 text-sm text-[#203d11]">@{report.reporterUsername || 'Unknown'}</td>
                              <td className="px-3 py-2">
                                <span className="px-2 py-1 rounded-lg text-xs text-white bg-[#975b1d]">{REASON_LABELS[report.reason] || report.reason}</span>
                                {report.details && <p className="text-xs mt-1 text-[#203d11]/60">{report.details}</p>}
                              </td>
                              <td className="px-3 py-2 text-xs text-[#203d11]/60">{new Date(report.createdAt).toLocaleString('vi-VN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    {selectedReportStatus === 'pending' ? (
                      <div className="mt-4 space-y-2">
                        <h4 className="font-semibold text-[#203d11]">Hành động</h4>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openActionDialog('dismiss', 'post')} className="px-3 py-2 bg-[#203d11]/10 text-[#203d11] rounded-xl text-sm font-medium hover:bg-[#203d11]/20 transition-colors duration-200">Bỏ qua</button>
                          <button onClick={() => openActionDialog('warn', 'post')} className="px-3 py-2 bg-[#975b1d]/10 text-[#975b1d] rounded-xl text-sm font-medium hover:bg-[#975b1d]/20 transition-colors duration-200">Cảnh báo</button>
                          <button onClick={() => openActionDialog('hide_post', 'post')} className="px-3 py-2 bg-[#975b1d] text-white rounded-xl text-sm font-medium hover:bg-[#7a4917] transition-colors duration-200">Ẩn bài</button>
                          <button onClick={() => openActionDialog('ban_user', 'post')} className="px-3 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors duration-200">Khóa user</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        <h4 className="font-semibold text-[#203d11]">Kết quả xử lý</h4>
                        <div className="rounded-xl p-4 border border-[#203d11]/20 bg-[#f5f0e8]/50">
                          {postDetail.post.moderationAction && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-[#203d11]/70">Hành động:</span>
                              <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${
                                postDetail.post.moderationAction === 'ban_user' ? 'bg-red-600' :
                                postDetail.post.moderationAction === 'hide_post' ? 'bg-orange-600' :
                                postDetail.post.moderationAction === 'warn' ? 'bg-yellow-600' :
                                'bg-gray-500'
                              }`}>
                                {ACTION_LABELS[postDetail.post.moderationAction] || postDetail.post.moderationAction}
                              </span>
                            </div>
                          )}
                          {postDetail.post.moderationReason && (
                            <p className="text-sm text-[#203d11]"><strong>Lý do:</strong> {postDetail.post.moderationReason}</p>
                          )}
                          {postDetail.post.moderatedAt && (
                            <p className="text-xs text-[#203d11]/60 mt-2">
                              Xử lý lúc: {new Date(postDetail.post.moderatedAt).toLocaleString('vi-VN')}
                            </p>
                          )}
                          {postDetail.post.status === 'hidden' && (
                            <div className="mt-2 p-2 bg-orange-100 rounded-lg">
                              <p className="text-xs text-orange-700">Bài viết đã bị ẩn và sẽ tự động xóa sau 7 ngày nếu không có kháng cáo</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comment Detail Modal */}
      {selectedCommentId && commentDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#203d11]/10">
                <h2 className="text-xl font-bold text-[#203d11]">Chi tiết bình luận bị báo cáo</h2>
                <button onClick={closeAllModals} className="text-2xl text-[#203d11]/60 hover:text-[#203d11] transition-colors duration-200">×</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3 text-[#203d11]">Nội dung bình luận</h3>
                  <div className="rounded-xl p-4 border-2 border-[#203d11]/20 bg-[#f5f0e8]/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-[#203d11] flex items-center justify-center text-white font-medium">
                        {commentDetail.comment.authorUsername?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-[#203d11]">@{commentDetail.comment.authorUsername}</p>
                        <p className="text-xs text-[#203d11]/60">{new Date(commentDetail.comment.createdAt).toLocaleString('vi-VN')}</p>
                      </div>
                    </div>
                    <p className="text-[#203d11]">{commentDetail.comment.content}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-[#203d11]">Danh sách báo cáo ({commentDetail.reports.length})</h3>
                  <div className="border border-[#203d11]/20 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-[#203d11]">
                        <tr>
                          <th className="px-3 py-2 text-left text-white text-sm">Người báo cáo</th>
                          <th className="px-3 py-2 text-left text-white text-sm">Lý do</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#203d11]/10">
                        {commentDetail.reports.map((report, idx) => (
                          <tr key={report.reportId} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f5f0e8]/30'}>
                            <td className="px-3 py-2 text-sm text-[#203d11]">@{report.reporterUsername || 'Unknown'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-1 rounded-lg text-xs text-white bg-[#975b1d]">{REASON_LABELS[report.reason] || report.reason}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selectedReportStatus === 'pending' ? (
                    <div className="mt-4 space-y-2">
                      <h4 className="font-semibold text-[#203d11]">Hành động</h4>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openActionDialog('dismiss', 'comment')} className="px-3 py-2 bg-[#203d11]/10 text-[#203d11] rounded-xl text-sm font-medium hover:bg-[#203d11]/20 transition-colors duration-200">Bỏ qua</button>
                        <button onClick={() => openActionDialog('warn', 'comment')} className="px-3 py-2 bg-[#975b1d]/10 text-[#975b1d] rounded-xl text-sm font-medium hover:bg-[#975b1d]/20 transition-colors duration-200">Cảnh báo</button>
                        <button onClick={() => openActionDialog('hide_comment', 'comment')} className="px-3 py-2 bg-[#975b1d] text-white rounded-xl text-sm font-medium hover:bg-[#7a4917] transition-colors duration-200">Ẩn comment</button>
                        <button onClick={() => openActionDialog('ban_user', 'comment')} className="px-3 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors duration-200">Khóa user</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <h4 className="font-semibold text-[#203d11]">Kết quả xử lý</h4>
                      <div className="rounded-xl p-4 border border-[#203d11]/20 bg-[#f5f0e8]/50">
                        {commentDetail.comment.moderationAction && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm text-[#203d11]/70">Hành động:</span>
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${
                              commentDetail.comment.moderationAction === 'ban_user' ? 'bg-red-600' :
                              commentDetail.comment.moderationAction === 'hide_comment' ? 'bg-orange-600' :
                              commentDetail.comment.moderationAction === 'warn' ? 'bg-yellow-600' :
                              'bg-gray-500'
                            }`}>
                              {ACTION_LABELS[commentDetail.comment.moderationAction] || commentDetail.comment.moderationAction}
                            </span>
                          </div>
                        )}
                        {commentDetail.comment.moderationReason && (
                          <p className="text-sm text-[#203d11]"><strong>Lý do:</strong> {commentDetail.comment.moderationReason}</p>
                        )}
                        {commentDetail.comment.moderatedAt && (
                          <p className="text-xs text-[#203d11]/60 mt-2">
                            Xử lý lúc: {new Date(commentDetail.comment.moderatedAt).toLocaleString('vi-VN')}
                          </p>
                        )}
                        {commentDetail.comment.status === 'hidden' && (
                          <div className="mt-2 p-2 bg-orange-100 rounded-lg">
                            <p className="text-xs text-orange-700">Bình luận đã bị ẩn và sẽ tự động xóa sau 7 ngày nếu không có kháng cáo</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Dialog */}
      {showActionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4 text-[#203d11]">{ACTION_LABELS[actionForm.action] || actionForm.action}</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-[#203d11]">Lý do</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(PRESET_REASONS[actionForm.action] || []).map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setActionForm({ ...actionForm, reason })}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                      actionForm.reason === reason ? 'bg-[#203d11] text-white' : 'bg-[#f5f0e8] text-[#203d11] hover:bg-[#203d11]/10'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <textarea
                value={actionForm.reason}
                onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })}
                className="w-full px-4 py-3 border-2 border-[#203d11]/20 rounded-xl resize-none focus:border-[#203d11] transition-all duration-200"
                rows={3}
                placeholder="Nhập lý do..."
              />
            </div>

            {actionForm.action === 'ban_user' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-[#203d11]">Thời hạn khóa</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={actionForm.banDuration}
                    onChange={(e) => setActionForm({ ...actionForm, banDuration: parseInt(e.target.value) || 0 })}
                    className="w-24 px-3 py-2 border-2 border-[#203d11]/20 rounded-xl focus:border-[#203d11] transition-all duration-200"
                    min="0"
                  />
                  <select
                    value={actionForm.banDurationUnit}
                    onChange={(e) => setActionForm({ ...actionForm, banDurationUnit: e.target.value as BanDurationUnit })}
                    className="px-3 py-2 border-2 border-[#203d11]/20 rounded-xl bg-white focus:border-[#203d11] transition-all duration-200"
                  >
                    <option value="minutes">Phút</option>
                    <option value="hours">Giờ</option>
                    <option value="days">Ngày</option>
                  </select>
                </div>
                <p className="text-xs text-[#203d11]/60 mt-1">Nhập 0 để khóa vĩnh viễn</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowActionDialog(false)} className="flex-1 px-4 py-2.5 border-2 border-[#203d11]/20 rounded-xl font-medium text-[#203d11] hover:bg-[#f5f0e8] transition-colors duration-200">
                Hủy
              </button>
              <button
                onClick={handleTakeAction}
                disabled={processing || !actionForm.reason.trim()}
                className="flex-1 px-4 py-2.5 bg-[#203d11] text-white rounded-xl font-medium hover:bg-[#2a5016] disabled:opacity-50 transition-colors duration-200"
              >
                {processing ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
