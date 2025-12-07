'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  checkBanStatus,
  checkBanStatusByUsername,
  submitAppeal,
  BanStatusResponse,
} from '@/services/admin';
import Logo from '@/components/Logo';

function BannedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get('userId');
  const username = searchParams.get('username');
  const [ban, setBan] = useState<BanStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [uid, setUid] = useState(userId);

  useEffect(() => {
    if (!userId && !username) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        let s: BanStatusResponse;
        if (userId) {
          s = await checkBanStatus(userId);
          setUid(userId);
        } else {
          s = await checkBanStatusByUsername(username!);
          if (s.userId) setUid(s.userId);
        }
        setBan(s);
        if (!s.isBanned) router.push('/login');
      } catch {
        setError('Không thể tải thông tin');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, username, router]);

  const handleAppeal = async () => {
    if (reason.length < 10) {
      setError('Nhập ít nhất 10 ký tự');
      return;
    }
    if (!uid) {
      setError('Không xác định được tài khoản');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitAppeal({ userId: uid, reason });
      setSubmitted(true);
      setShowForm(false);
    } catch (e: any) {
      setError(e.message || 'Gửi thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Logo size={56} className="animate-pulse" />
      </div>
    );

  if (!ban?.isBanned)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
        <div className="w-full max-w-[1200px]">
          <div className="max-w-md mx-auto text-center">
            <Logo size={56} className="mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-[#203d11] mb-4">Không tìm thấy thông tin</h1>
            <p className="text-[#203d11]/60 mb-6">
              Tài khoản không bị khóa hoặc thông tin không hợp lệ.
            </p>
            <Link
              href="/login"
              className="inline-block h-12 px-8 bg-[#203d11] text-white rounded-xl font-semibold leading-[48px] hover:bg-[#2a5016] transition-all"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
      <div className="w-full max-w-[1200px]">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl">⛔</span>
            </div>
            <h1 className="text-3xl font-bold text-red-600 mb-2">Tài khoản bị khóa</h1>
            <p className="text-[#203d11]/60">
              Tài khoản của bạn đã bị khóa do vi phạm quy định cộng đồng.
            </p>
          </div>

          {/* Ban Details */}
          <div className="bg-white rounded-2xl p-8 shadow-xl border border-[#203d11]/5 mb-6">
            <h2 className="font-bold text-[#203d11] mb-4">Chi tiết vi phạm</h2>
            <div className="space-y-4 text-sm">
              <div className="p-4 bg-[#f5f0e8] rounded-xl">
                <p className="text-[#203d11]/60 mb-1">Lý do</p>
                <p className="font-medium text-[#203d11]">
                  {ban.banReason || 'Vi phạm quy định cộng đồng'}
                </p>
              </div>
              {ban.violationContent && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-red-600/80 mb-1">Nội dung vi phạm</p>
                  <p className="text-[#203d11] italic">"{ban.violationContent}"</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[#f5f0e8] rounded-xl">
                  <p className="text-[#203d11]/60 mb-1">Thời hạn</p>
                  <p className="font-medium text-[#203d11]">
                    {ban.banDurationDisplay || 'Vĩnh viễn'}
                  </p>
                </div>
                <div className="p-4 bg-[#f5f0e8] rounded-xl">
                  <p className="text-[#203d11]/60 mb-1">Còn lại</p>
                  <p className="font-medium text-[#975b1d]">{ban.remainingTime || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Appeal Status */}
          {ban.appealStatus === 'approved' && (
            <div className="bg-green-50 rounded-2xl p-6 border border-green-100 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">✓</span>
                <h3 className="font-bold text-green-700">Kháng cáo được chấp nhận</h3>
              </div>
              <p className="text-green-600 text-sm mb-4">Tài khoản của bạn đã được mở khóa.</p>
              <Link
                href="/dashboard"
                className="inline-block h-10 px-6 bg-[#203d11] text-white rounded-lg font-medium leading-[40px] hover:bg-[#2a5016] transition-all"
              >
                Vào Dashboard
              </Link>
            </div>
          )}

          {ban.appealStatus === 'rejected' && (
            <div className="bg-red-50 rounded-2xl p-6 border border-red-100 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">✗</span>
                <h3 className="font-bold text-red-600">Kháng cáo bị từ chối</h3>
              </div>
              {ban.appealReviewNotes && (
                <p className="text-[#203d11]/70 text-sm">{ban.appealReviewNotes}</p>
              )}
            </div>
          )}

          {ban.appealStatus === 'pending' && (
            <div className="bg-yellow-50 rounded-2xl p-6 border border-yellow-100 mb-6">
              <div className="flex items-center gap-3">
                <span className="text-xl">⏳</span>
                <div>
                  <h3 className="font-bold text-yellow-700">Đang chờ xử lý</h3>
                  <p className="text-yellow-600 text-sm">Kháng cáo của bạn đang được xem xét.</p>
                </div>
              </div>
            </div>
          )}

          {submitted && (
            <div className="bg-green-50 rounded-2xl p-6 border border-green-100 mb-6">
              <div className="flex items-center gap-3">
                <span className="text-xl">✓</span>
                <div>
                  <h3 className="font-bold text-green-700">Đã gửi kháng cáo</h3>
                  <p className="text-green-600 text-sm">
                    Vui lòng đăng nhập lại sau để xem kết quả.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Appeal Form */}
          {showForm ? (
            <div className="bg-white rounded-2xl p-6 shadow-xl border border-[#203d11]/5 mb-6">
              <h3 className="font-bold text-[#203d11] mb-4">Gửi kháng cáo</h3>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-32 p-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none resize-none transition-all"
                placeholder="Giải thích lý do bạn cho rằng việc khóa tài khoản là không hợp lý... (tối thiểu 10 ký tự)"
                maxLength={1000}
              />
              <p className="text-xs text-[#203d11]/40 mt-2 mb-4">{reason.length}/1000 ký tự</p>
              <div className="flex gap-3">
                <button
                  onClick={handleAppeal}
                  disabled={submitting || reason.length < 10}
                  className="flex-1 h-10 bg-[#203d11] text-white rounded-lg font-medium hover:bg-[#2a5016] disabled:opacity-50 transition-all"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi kháng cáo'}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setError('');
                  }}
                  className="flex-1 h-10 border-2 border-[#203d11]/20 text-[#203d11] rounded-lg font-medium hover:border-[#203d11]/40 transition-all"
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            ban.canAppeal &&
            ban.appealStatus !== 'pending' &&
            ban.appealStatus !== 'approved' &&
            !submitted && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] transition-all mb-6"
              >
                {ban.appealStatus === 'rejected' ? 'Gửi kháng cáo mới' : 'Gửi kháng cáo'}
              </button>
            )
          )}

          {/* Back to Login */}
          <Link
            href="/login"
            className="block w-full h-12 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl font-semibold text-center leading-[44px] hover:border-[#203d11]/40 transition-all"
          >
            ← Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BannedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
          <Logo size={56} className="animate-pulse" />
        </div>
      }
    >
      <BannedContent />
    </Suspense>
  );
}
