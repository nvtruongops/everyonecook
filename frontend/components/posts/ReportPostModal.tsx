'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { reportPost, ReportReason } from '@/services/posts';

interface Props {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  onReported?: () => void;
}

const REASONS: { v: ReportReason; l: string; d: string }[] = [
  { v: 'spam', l: 'Spam', d: 'Nội dung lặp lại hoặc không liên quan' },
  { v: 'inappropriate', l: 'Không phù hợp', d: 'Nội dung xúc phạm, khiêu dâm' },
  { v: 'harassment', l: 'Quấy rối', d: 'Bắt nạt, đe dọa hoặc ngôn từ thù địch' },
  { v: 'misinformation', l: 'Sai lệch', d: 'Thông tin sai hoặc gây hiểu lầm' },
  { v: 'other', l: 'Khác', d: 'Vi phạm khác' },
];

export default function ReportPostModal({ postId, isOpen, onClose, onReported }: Props) {
  const { token } = useAuth();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReport = async () => {
    if (!token) {
      setError('Bạn cần đăng nhập');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await reportPost(token, postId, reason, details.trim() || undefined);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setReason('spam');
        setDetails('');
        onReported?.();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi báo cáo');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setReason('spam');
      setDetails('');
      setError(null);
      setSuccess(false);
    }
  };

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[99999]"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto border border-[#203d11]/5"
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-[#203d11]/10 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✅
            </div>
            <h3 className="text-lg font-bold text-[#203d11] mb-2">Đã gửi báo cáo</h3>
            <p className="text-[#203d11]/60">Cảm ơn bạn đã giúp giữ cộng đồng an toàn.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#203d11]">Báo cáo bài đăng</h3>
              <button
                onClick={handleClose}
                className="text-[#203d11]/40 hover:text-[#203d11] transition-all"
              >
                ✕
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#203d11] mb-2">
                Lý do báo cáo
              </label>
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <label
                    key={r.v}
                    className={`flex items-start p-3 border-2 rounded-xl cursor-pointer transition-all ${reason === r.v ? 'border-red-500 bg-red-50' : 'border-[#203d11]/10 hover:border-[#203d11]/30'}`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.v}
                      checked={reason === r.v}
                      onChange={(e) => setReason(e.target.value as ReportReason)}
                      className="mt-1 mr-3"
                    />
                    <div>
                      <div className="font-medium text-[#203d11]">{r.l}</div>
                      <div className="text-sm text-[#203d11]/60">{r.d}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#203d11] mb-2">
                Chi tiết (tùy chọn)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Mô tả thêm..."
                className="w-full p-3 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-red-500 focus:bg-white focus:outline-none transition-all resize-none"
                rows={3}
                maxLength={1000}
              />
              <p className="text-xs text-[#203d11]/40 mt-1">{details.length}/1000</p>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 px-4 py-2 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] transition-all disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleReport}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Đang gửi...' : 'Gửi báo cáo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
