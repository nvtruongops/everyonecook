/**
 * Report Button Component
 * Button and modal to report a post
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { reportPost, ReportReason } from '@/services/posts';

interface ReportButtonProps {
  postId: string;
  onReported?: () => void;
  onOpenModal?: () => void;
}

const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: 'spam',
    label: 'Spam',
    description: 'Nội dung lặp lại hoặc không liên quan',
  },
  {
    value: 'inappropriate',
    label: 'Nội dung không phù hợp',
    description: 'Nội dung xúc phạm, khiêu dâm hoặc gây khó chịu',
  },
  {
    value: 'harassment',
    label: 'Quấy rối',
    description: 'Bắt nạt, đe dọa hoặc ngôn từ thù địch',
  },
  {
    value: 'misinformation',
    label: 'Thông tin sai lệch',
    description: 'Thông tin sai hoặc gây hiểu lầm',
  },
  {
    value: 'other',
    label: 'Khác',
    description: 'Vi phạm khác',
  },
];

export default function ReportButton({ postId, onReported, onOpenModal }: ReportButtonProps) {
  const { token } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  // For portal - ensure we're on client side
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleReport = async () => {
    if (!token) {
      setError('Bạn cần đăng nhập để báo cáo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await reportPost(token, postId, reason, details.trim() || undefined);

      setSuccess(true);
      setTimeout(() => {
        setShowModal(false);
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

  return (
    <>
      {/* Report Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log('[ReportButton] Button clicked, opening modal');
          setShowModal(true);
          // Delay closing menu to ensure modal state is set
          setTimeout(() => {
            onOpenModal?.();
          }, 0);
        }}
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
          />
        </svg>
        Báo cáo
      </button>

      {/* Report Modal - using Portal to render outside dropdown */}
      {mounted && showModal && (
        <>
          {console.log('[ReportButton] Rendering modal via portal')}
          {createPortal(
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                zIndex: 99999,
              }}
              onClick={() => setShowModal(false)}
            >
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  maxWidth: '28rem',
                  width: '100%',
                  padding: '1.5rem',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {success ? (
                  // Success State
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Đã gửi báo cáo</h3>
                    <p className="text-gray-600">
                      Cảm ơn bạn đã giúp giữ cộng đồng an toàn. Chúng tôi sẽ xem xét báo cáo này
                      sớm.
                    </p>
                  </div>
                ) : (
                  // Report Form
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Báo cáo bài đăng</h3>
                      <button
                        onClick={() => setShowModal(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Reason Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tại sao bạn báo cáo bài đăng này?
                      </label>
                      <div className="space-y-2">
                        {REPORT_REASONS.map((r) => (
                          <label
                            key={r.value}
                            className={`flex items-start p-3 border rounded-lg cursor-pointer transition ${
                              reason === r.value
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="reason"
                              value={r.value}
                              checked={reason === r.value}
                              onChange={(e) => setReason(e.target.value as ReportReason)}
                              className="mt-1 mr-3"
                            />
                            <div>
                              <div className="font-medium text-gray-900">{r.label}</div>
                              <div className="text-sm text-gray-600">{r.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Details Input */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chi tiết (tùy chọn)
                      </label>
                      <textarea
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Mô tả thêm về vấn đề..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                        rows={4}
                        maxLength={1000}
                      />
                      <p className="text-xs text-gray-500 mt-1">{details.length}/1000 ký tự</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600">{error}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowModal(false)}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleReport}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Đang gửi...' : 'Gửi báo cáo'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </>
  );
}
