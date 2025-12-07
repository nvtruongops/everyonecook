'use client';
import { useState } from 'react';

interface BanInfo {
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  banExpiresAt?: number;
  violationType?: string;
  violationContent?: string;
  reportCount?: number;
  postId?: string;
  commentId?: string;
}
interface Props {
  banInfo: BanInfo;
  onClose: () => void;
  onAppeal: () => void;
}

export default function BanNotificationModal({ banInfo, onClose, onAppeal }: Props) {
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatDate = (ts?: number) =>
    ts
      ? new Date(ts).toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Không xác định';
  const getBanDuration = () => {
    if (!banInfo.banExpiresAt) return 'Vĩnh viễn';
    if (banInfo.banExpiresAt <= Date.now()) return 'Đã hết hạn';
    return `${Math.ceil((banInfo.banExpiresAt - Date.now()) / 86400000)} ngày`;
  };
  const handleSubmit = async () => {
    if (!appealReason.trim()) return;
    setSubmitting(true);
    try {
      onAppeal();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        <div className="bg-red-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full text-white text-xl">⛔</div>
            <div>
              <h2 className="text-xl font-bold text-white">Tài khoản bị khóa</h2>
              <p className="text-white/80 text-sm">
                Tài khoản của bạn đã bị khóa do vi phạm quy định
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h3 className="font-semibold text-red-800 mb-2">Lý do khóa tài khoản</h3>
            <p className="text-red-700">{banInfo.banReason || 'Vi phạm quy định cộng đồng'}</p>
          </div>
          {banInfo.violationContent && (
            <div className="bg-[#f5f0e8] border border-[#203d11]/10 rounded-xl p-4">
              <h3 className="font-semibold text-[#203d11] mb-2">Nội dung vi phạm</h3>
              <p className="text-[#203d11]/70 text-sm bg-white p-3 rounded-lg border italic">
                "{banInfo.violationContent}"
              </p>
              {banInfo.reportCount && banInfo.reportCount > 0 && (
                <p className="text-[#203d11]/60 text-sm mt-2">
                  Số lượng báo cáo: <strong className="text-red-600">{banInfo.reportCount}</strong>
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-[#f5f0e8] rounded-xl p-3">
              <span className="text-[#203d11]/60">Thời gian khóa</span>
              <p className="font-medium text-[#203d11]">{formatDate(banInfo.bannedAt)}</p>
            </div>
            <div className="bg-[#f5f0e8] rounded-xl p-3">
              <span className="text-[#203d11]/60">Thời hạn</span>
              <p className="font-medium text-[#203d11]">{getBanDuration()}</p>
            </div>
          </div>
          {showAppeal ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-[#203d11]">Gửi kháng cáo</h3>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Nhập lý do kháng cáo..."
                className="w-full p-3 border-2 border-transparent bg-[#f5f0e8]/50 rounded-xl resize-none focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
                rows={4}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAppeal(false)}
                  className="flex-1 px-4 py-2 border border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] transition-all"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!appealReason.trim() || submitting}
                  className="flex-1 px-4 py-2 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition-all"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi kháng cáo'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] font-medium transition-all"
              >
                Đóng
              </button>
              <button
                onClick={() => setShowAppeal(true)}
                className="flex-1 px-4 py-3 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] font-medium transition-all"
              >
                Kháng cáo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
