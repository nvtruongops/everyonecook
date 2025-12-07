'use client';
import { useState } from 'react';

interface AdminAction {
  actionId: string;
  actionType: 'DELETE_POST' | 'HIDE_POST' | 'DELETE_COMMENT' | 'HIDE_COMMENT';
  reason: string;
  reportCount?: number;
  createdAt: string;
  postId?: string;
  commentId?: string;
  contentPreview?: string;
  canAppeal: boolean;
  appealDeadline?: string;
}
interface Props {
  action: AdminAction;
  onClose: () => void;
  onAppeal: (actionId: string, reason: string) => Promise<void>;
}

export default function AdminActionNotification({ action, onClose, onAppeal }: Props) {
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const labels: Record<string, string> = {
    DELETE_POST: 'Bài viết đã bị xóa',
    HIDE_POST: 'Bài viết đã bị ẩn',
    DELETE_COMMENT: 'Bình luận đã bị xóa',
    HIDE_COMMENT: 'Bình luận đã bị ẩn',
  };
  const icons: Record<string, string> = {
    DELETE_POST: '🗑️',
    HIDE_POST: '👁️‍🗨️',
    DELETE_COMMENT: '🗑️',
    HIDE_COMMENT: '👁️‍🗨️',
  };
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const handleSubmit = async () => {
    if (!appealReason.trim()) return;
    setSubmitting(true);
    try {
      await onAppeal(action.actionId, appealReason);
      setShowAppeal(false);
      setAppealReason('');
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#f5f0e8] border border-[#975b1d]/30 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-[#975b1d] text-white rounded-xl flex-shrink-0 text-lg">
          {icons[action.actionType] || '⚠️'}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#203d11]">
              {labels[action.actionType] || 'Nội dung đã bị xử lý'}
            </h3>
            <button
              onClick={onClose}
              className="text-[#975b1d] hover:text-[#203d11] p-1 transition-all"
              title="Đóng"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-[#975b1d] mt-1">{formatDate(action.createdAt)}</p>
        </div>
      </div>
      {action.contentPreview && (
        <div className="mt-3 bg-white/50 border border-[#975b1d]/20 rounded-lg p-3">
          <p className="text-sm text-[#203d11] italic">"{action.contentPreview}"</p>
        </div>
      )}
      <div className="mt-3">
        <p className="text-sm text-[#203d11]">
          <strong>Lý do:</strong> {action.reason}
        </p>
        {action.reportCount && action.reportCount > 0 && (
          <p className="text-sm text-[#975b1d] mt-1">
            Số lượng báo cáo: <strong className="text-red-600">{action.reportCount}</strong>
          </p>
        )}
      </div>
      {action.canAppeal && (
        <div className="mt-4 pt-3 border-t border-[#975b1d]/20">
          {action.appealDeadline && (
            <p className="text-xs text-[#975b1d] mb-2">
              Hạn kháng cáo: {formatDate(action.appealDeadline)}
            </p>
          )}
          {showAppeal ? (
            <div className="space-y-3">
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Nhập lý do kháng cáo..."
                className="w-full p-3 border-2 border-transparent bg-white/50 rounded-xl resize-none focus:border-[#975b1d] focus:outline-none transition-all text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAppeal(false)}
                  className="flex-1 px-3 py-2 border border-[#975b1d]/30 text-[#203d11] rounded-xl hover:bg-white/50 text-sm transition-all"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!appealReason.trim() || submitting}
                  className="flex-1 px-3 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 text-sm transition-all"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi kháng cáo'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAppeal(true)}
              className="w-full px-4 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] text-sm font-medium transition-all"
            >
              Kháng cáo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
