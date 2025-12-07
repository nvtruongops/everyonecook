'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAppeals, reviewAppeal, Appeal } from '@/services/admin';

type TabStatus = 'pending' | 'approved' | 'rejected';

export default function AdminAppealsPage() {
  const { token, refreshToken } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabStatus>('pending');
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppeals();
  }, [activeTab, token]);

  async function getToken(): Promise<string | null> {
    if (token) return token;
    return await refreshToken();
  }

  async function loadAppeals() {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) return;
      const result = await getAppeals(accessToken, { status: activeTab, limit: 50 });
      setAppeals(result.appeals || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách kháng cáo');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(action: 'approve' | 'reject') {
    if (!selectedAppeal || !reviewNotes.trim()) {
      setError('Vui lòng nhập lý do');
      return;
    }
    if (reviewNotes.trim().length < 5) {
      setError('Lý do phải có ít nhất 5 ký tự');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) return;
      await reviewAppeal(selectedAppeal.appealId, action, reviewNotes, accessToken);
      setSelectedAppeal(null);
      setReviewNotes('');
      loadAppeals();
    } catch (err: any) {
      setError(err.message || 'Không thể xử lý kháng cáo');
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { key: TabStatus; label: string }[] = [
    { key: 'pending', label: 'Chờ xử lý' },
    { key: 'approved', label: 'Đã chấp nhận' },
    { key: 'rejected', label: 'Đã từ chối' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-[#203d11]">Quản lý kháng cáo</h1>
        <button
          onClick={loadAppeals}
          className="px-5 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-colors duration-200 font-medium"
        >
          Làm mới
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#203d11]/10 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 ${
              activeTab === tab.key
                ? 'border-[#203d11] text-[#203d11]'
                : 'border-transparent text-[#203d11]/50 hover:text-[#203d11]/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Appeals List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#203d11]"></div>
        </div>
      ) : appeals.length === 0 ? (
        <div className="text-center py-12 text-[#203d11]/60">Không có kháng cáo nào</div>
      ) : (
        <div className="space-y-4">
          {appeals.map((appeal) => (
            <div
              key={appeal.appealId}
              className="bg-white rounded-xl shadow-sm border border-[#203d11]/10 p-5 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* User info */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-semibold text-[#203d11]">{appeal.username || 'Unknown'}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-lg font-medium ${
                        appeal.status === 'pending'
                          ? 'bg-[#975b1d]/10 text-[#975b1d]'
                          : appeal.status === 'approved'
                            ? 'bg-[#203d11]/10 text-[#203d11]'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {appeal.status === 'pending' ? 'Chờ xử lý' : appeal.status === 'approved' ? 'Đã chấp nhận' : 'Đã từ chối'}
                    </span>
                  </div>

                  {/* Ban/Hidden reason - show based on appeal type */}
                  {appeal.appealType === 'content' ? (
                    <div className="text-sm text-[#203d11]/70 mb-3">
                      <span className="font-medium text-[#203d11]">Lý do ẩn {appeal.contentType === 'post' ? 'bài viết' : 'bình luận'}:</span>{' '}
                      {appeal.hiddenReason || 'Vi phạm quy định cộng đồng'}
                    </div>
                  ) : (
                    <div className="text-sm text-[#203d11]/70 mb-3">
                      <span className="font-medium text-[#203d11]">Lý do ban:</span> {appeal.banReason || 'Không rõ'}
                    </div>
                  )}

                  {/* Appeal reason */}
                  <div className="bg-[#f5f0e8] rounded-xl p-4 mb-3">
                    <span className="text-xs text-[#203d11]/50 uppercase tracking-wide font-medium">Nội dung kháng cáo</span>
                    <p className="text-[#203d11] mt-1">{appeal.reason}</p>
                  </div>

                  {/* Violation details */}
                  {(appeal.postId || appeal.commentId) && (
                    <div className="bg-red-50 rounded-xl p-4 mb-3 border border-red-100">
                      <span className="text-xs text-red-600 uppercase tracking-wide font-medium">
                        Nội dung vi phạm ({appeal.violationType || 'post'})
                      </span>
                      {appeal.violationContent && (
                        <p className="text-[#203d11]/70 mt-1 italic">"{appeal.violationContent}"</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-[#203d11]/50">
                        {appeal.reportCount && appeal.reportCount > 0 && (
                          <span>Số báo cáo: <strong className="text-red-600">{appeal.reportCount}</strong></span>
                        )}
                        {appeal.postId && <span>Post ID: {appeal.postId.slice(0, 8)}...</span>}
                        {appeal.commentId && <span>Comment ID: {appeal.commentId.slice(0, 8)}...</span>}
                      </div>
                    </div>
                  )}

                  {/* Review info */}
                  {appeal.reviewedAt && (
                    <div className="bg-[#203d11]/5 rounded-xl p-4 border border-[#203d11]/10">
                      <span className="text-xs text-[#203d11]/60 uppercase tracking-wide font-medium">Phản hồi từ admin</span>
                      <p className="text-[#203d11]/70 mt-1">{appeal.reviewNotes}</p>
                      <p className="text-xs text-[#203d11]/50 mt-2">
                        — {appeal.reviewedByUsername || 'Admin'} • {new Date(appeal.reviewedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  )}

                  {/* Previous appeals */}
                  {appeal.previousAppeals && appeal.previousAppeals.length > 0 && (
                    <div className="bg-[#975b1d]/5 rounded-xl p-4 border border-[#975b1d]/20 mt-3">
                      <span className="text-xs text-[#975b1d] uppercase tracking-wide font-medium">
                        Lịch sử kháng cáo ({appeal.appealCount} lần)
                      </span>
                      <div className="mt-2 space-y-2">
                        {appeal.previousAppeals.map((prev, idx) => (
                          <div key={prev.appealId} className="bg-white rounded-lg p-3 border border-[#975b1d]/10 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#203d11]/50">#{idx + 1}</span>
                              <span className={`px-1.5 py-0.5 text-xs rounded ${
                                prev.status === 'approved' ? 'bg-[#203d11]/10 text-[#203d11]' :
                                prev.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-[#975b1d]/10 text-[#975b1d]'
                              }`}>
                                {prev.status === 'approved' ? 'Đã chấp nhận' : prev.status === 'rejected' ? 'Đã từ chối' : 'Chờ xử lý'}
                              </span>
                              <span className="text-xs text-[#203d11]/40">
                                {new Date(prev.createdAt).toLocaleDateString('vi-VN')}
                              </span>
                            </div>
                            <p className="text-[#203d11]/60 text-xs">{prev.reason}</p>
                            {prev.reviewNotes && (
                              <p className="text-xs text-[#203d11]/50 mt-1 italic">Admin: {prev.reviewNotes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="text-xs text-[#203d11]/40 mt-3">
                    Gửi lúc: {new Date(appeal.createdAt).toLocaleString('vi-VN')}
                    {appeal.appealCount && appeal.appealCount > 1 && (
                      <span className="ml-2 text-[#975b1d]">(Kháng cáo lần {appeal.appealCount})</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {appeal.status === 'pending' && (
                  <button
                    onClick={() => {
                      setSelectedAppeal(appeal);
                      setReviewNotes('');
                      setError(null);
                    }}
                    className="px-4 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-colors duration-200 text-sm font-medium flex-shrink-0"
                  >
                    Xử lý
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedAppeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-[#203d11] mb-4">Xử lý kháng cáo</h2>

              {/* Appeal summary */}
              <div className="bg-[#f5f0e8] rounded-xl p-4 mb-4">
                <p className="font-medium text-[#203d11]">{selectedAppeal.username}</p>
                {selectedAppeal.appealType === 'content' ? (
                  <p className="text-sm text-[#203d11]/60 mt-1">
                    Lý do ẩn {selectedAppeal.contentType === 'post' ? 'bài viết' : 'bình luận'}:{' '}
                    {selectedAppeal.hiddenReason || 'Vi phạm quy định cộng đồng'}
                  </p>
                ) : (
                  <p className="text-sm text-[#203d11]/60 mt-1">Lý do ban: {selectedAppeal.banReason}</p>
                )}
                <p className="text-sm text-[#203d11]/70 mt-2">{selectedAppeal.reason}</p>
              </div>

              {/* Review notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-[#203d11] mb-2">
                  Lý do xử lý <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full px-4 py-3 border border-[#203d11]/20 rounded-xl text-sm resize-none focus:ring-2 focus:ring-[#203d11]/20 focus:border-[#203d11] transition-all duration-200"
                  rows={3}
                  placeholder="Nhập lý do chấp nhận hoặc từ chối..."
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm mb-4 border border-red-200">{error}</div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleReview('approve')}
                  disabled={submitting || !reviewNotes.trim()}
                  className="flex-1 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-200"
                >
                  {submitting ? 'Đang xử lý...' : selectedAppeal.appealType === 'content' 
                    ? `Chấp nhận (Hiện ${selectedAppeal.contentType === 'post' ? 'bài viết' : 'bình luận'})` 
                    : 'Chấp nhận (Mở ban)'}
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={submitting || !reviewNotes.trim()}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-200"
                >
                  {submitting ? 'Đang xử lý...' : 'Từ chối'}
                </button>
              </div>

              <button
                onClick={() => {
                  setSelectedAppeal(null);
                  setReviewNotes('');
                  setError(null);
                }}
                className="w-full mt-3 py-2.5 bg-[#f5f0e8] text-[#203d11] rounded-xl hover:bg-[#203d11]/10 text-sm font-medium transition-colors duration-200"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
