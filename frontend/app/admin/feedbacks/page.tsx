'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getAllFeedbacks,
  getAdminFeedbackDetail,
  adminReplyToFeedback,
  closeFeedback,
  Feedback,
  FeedbackWithReplies,
  FeedbackStatus,
} from '@/services/feedback';

type FilterStatus = FeedbackStatus | 'all';

export default function AdminFeedbacksPage() {
  const { token, refreshToken } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackWithReplies | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (token) loadFeedbacks();
  }, [filterStatus, token]);

  const getToken = async (): Promise<string | null> => {
    if (token) return token;
    return await refreshToken();
  };

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      const accessToken = await getToken();
      if (!accessToken) return;
      const result = await getAllFeedbacks(accessToken, { status: 'all' });
      let filtered = result.feedbacks;

      if (filterStatus === 'pending') {
        filtered = result.feedbacks.filter((f) => f.status !== 'closed');
      } else if (filterStatus === 'closed') {
        filtered = result.feedbacks.filter((f) => f.status === 'closed');
      }

      setFeedbacks(filtered);
    } catch (err) {
      console.error('Failed to load feedbacks:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFeedbackDetail = async (feedbackId: string) => {
    setLoadingDetail(true);
    setConfirmClose(false);
    try {
      const accessToken = await getToken();
      if (!accessToken) return;
      const detail = await getAdminFeedbackDetail(feedbackId, accessToken);
      setSelectedFeedback(detail);
    } catch (err) {
      console.error('Failed to load feedback detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedFeedback || !replyContent.trim()) return;
    setSendingReply(true);
    try {
      const accessToken = await getToken();
      if (!accessToken) return;
      await adminReplyToFeedback(selectedFeedback.feedbackId, replyContent, accessToken);
      setReplyContent('');
      await loadFeedbackDetail(selectedFeedback.feedbackId);
      loadFeedbacks();
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const handleCloseFeedback = async () => {
    if (!selectedFeedback) return;
    setClosing(true);
    try {
      const accessToken = await getToken();
      if (!accessToken) return;
      await closeFeedback(selectedFeedback.feedbackId, accessToken);
      setSelectedFeedback(null);
      setConfirmClose(false);
      loadFeedbacks();
    } catch (err) {
      console.error('Failed to close feedback:', err);
    } finally {
      setClosing(false);
    }
  };

  const displayStatuses: ('all' | 'pending' | 'closed')[] = ['all', 'pending', 'closed'];
  const pendingCount = feedbacks.filter((f) => f.status !== 'closed').length;
  const closedCount = feedbacks.filter((f) => f.status === 'closed').length;

  const statusCounts = {
    all: feedbacks.length,
    pending: pendingCount,
    closed: closedCount,
  };

  const statusLabels = {
    all: 'Tất cả',
    pending: 'Chờ xử lý',
    closed: 'Đã đóng',
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[#203d11]">Góp ý từ người dùng</h1>
        <p className="text-[#203d11]/60 mt-1">Quản lý và phản hồi góp ý từ người dùng</p>
      </div>

      {/* Stats Tabs */}
      <div className="grid grid-cols-3 gap-4">
        {displayStatuses.map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`p-4 md:p-5 rounded-xl border-2 transition-all duration-200 ${
              filterStatus === status
                ? 'border-[#203d11] bg-[#203d11]/5'
                : 'border-[#203d11]/10 bg-white hover:border-[#203d11]/30'
            }`}
          >
            <div className={`text-2xl md:text-3xl font-bold ${filterStatus === status ? 'text-[#203d11]' : 'text-[#203d11]/70'}`}>
              {statusCounts[status]}
            </div>
            <div className="text-sm text-[#203d11]/60">{statusLabels[status]}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feedback List */}
        <div className="bg-white rounded-xl shadow-sm border border-[#203d11]/10">
          <div className="p-4 border-b border-[#203d11]/10">
            <h2 className="font-semibold text-[#203d11]">Danh sách góp ý</h2>
          </div>
          <div className="divide-y divide-[#203d11]/10 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-[#203d11]/60">Đang tải...</div>
            ) : feedbacks.length === 0 ? (
              <div className="p-8 text-center text-[#203d11]/60">Không có góp ý nào</div>
            ) : (
              feedbacks.map((feedback) => (
                <button
                  key={feedback.feedbackId}
                  onClick={() => loadFeedbackDetail(feedback.feedbackId)}
                  className={`w-full text-left p-4 hover:bg-[#f5f0e8] transition-colors duration-200 ${
                    selectedFeedback?.feedbackId === feedback.feedbackId ? 'bg-[#203d11]/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[#203d11] truncate">{feedback.title}</span>
                        {feedback.status === 'pending' && (
                          <span className="w-2 h-2 bg-[#975b1d] rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-[#203d11]/60 line-clamp-1">{feedback.content}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-[#203d11]/50">@{feedback.username}</span>
                        <span className="text-xs text-[#203d11]/30">•</span>
                        <span className="text-xs text-[#203d11]/50">
                          {new Date(feedback.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${
                        feedback.status === 'closed'
                          ? 'bg-[#203d11]/10 text-[#203d11]'
                          : 'bg-[#975b1d]/10 text-[#975b1d]'
                      }`}
                    >
                      {feedback.status === 'closed' ? 'Đã đóng' : 'Chờ xử lý'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Feedback Detail */}
        <div className="bg-white rounded-xl shadow-sm border border-[#203d11]/10">
          <div className="p-4 border-b border-[#203d11]/10 flex items-center justify-between">
            <h2 className="font-semibold text-[#203d11]">Chi tiết góp ý</h2>
            {selectedFeedback && selectedFeedback.status !== 'closed' && (
              <div className="flex items-center gap-2">
                {confirmClose ? (
                  <>
                    <span className="text-sm text-[#203d11]/60">Xác nhận?</span>
                    <button
                      onClick={handleCloseFeedback}
                      disabled={closing}
                      className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors duration-200"
                    >
                      {closing ? '...' : 'Đóng'}
                    </button>
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="px-3 py-1.5 text-sm text-[#203d11] hover:bg-[#f5f0e8] rounded-lg transition-colors duration-200"
                    >
                      Hủy
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmClose(true)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  >
                    Đóng góp ý
                  </button>
                )}
              </div>
            )}
          </div>

          {loadingDetail ? (
            <div className="p-8 text-center text-[#203d11]/60">Đang tải...</div>
          ) : !selectedFeedback ? (
            <div className="p-8 text-center text-[#203d11]/60">Chọn một góp ý để xem chi tiết</div>
          ) : (
            <div className="flex flex-col h-[550px]">
              {/* Feedback content */}
              <div className="p-4 border-b border-[#203d11]/10 bg-[#f5f0e8]/50">
                <div className="flex items-center gap-3 mb-3">
                  {selectedFeedback.userAvatarUrl ? (
                    <img src={selectedFeedback.userAvatarUrl} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#203d11] flex items-center justify-center">
                      <span className="text-white font-medium">
                        {selectedFeedback.username?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-[#203d11]">@{selectedFeedback.username}</div>
                    <div className="text-xs text-[#203d11]/50">
                      {new Date(selectedFeedback.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-[#203d11] mb-2">{selectedFeedback.title}</h3>
                <p className="text-[#203d11]/70 text-sm whitespace-pre-wrap">{selectedFeedback.content}</p>
              </div>

              {/* Replies */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedFeedback.replies.length === 0 ? (
                  <div className="text-center text-[#203d11]/40 py-4">Chưa có phản hồi</div>
                ) : (
                  selectedFeedback.replies.map((reply) => (
                    <div
                      key={reply.replyId}
                      className={`p-3 rounded-xl ${reply.isAdmin ? 'bg-[#203d11]/5 ml-4' : 'bg-[#f5f0e8] mr-4'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium ${reply.isAdmin ? 'text-[#203d11]' : 'text-[#975b1d]'}`}>
                          {reply.isAdmin ? 'Admin' : `@${reply.username}`}
                        </span>
                        <span className="text-xs text-[#203d11]/40">
                          {new Date(reply.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <p className="text-sm text-[#203d11]/70 whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Reply input */}
              {selectedFeedback.status !== 'closed' && (
                <div className="p-4 border-t border-[#203d11]/10">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Nhập phản hồi..."
                      className="flex-1 px-4 py-2.5 border border-[#203d11]/20 rounded-xl focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] transition-all duration-200"
                      onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={sendingReply || !replyContent.trim()}
                      className="px-5 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition-colors duration-200 font-medium"
                    >
                      {sendingReply ? '...' : 'Gửi'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
