'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';
import CachedAvatar from '@/components/ui/CachedAvatar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

interface ViolationDetail {
  violationId?: string;
  contentType: 'post' | 'comment';
  contentId: string;
  content: {
    id: string;
    authorId: string;
    authorUsername: string;
    authorAvatarUrl?: string;
    text?: string;
    caption?: string;
    imageUrls?: string[];
    status: string;
    hiddenAt?: number;
    hiddenReason?: string;
    canAppeal: boolean;
    appealDeadline?: number;
  };
  violation: {
    type: string;
    reason: string;
    severity: string;
    adminUsername?: string;
    createdAt: number;
    reportCount: number;
  };
  appeal?: {
    appealId: string;
    status: 'pending' | 'approved' | 'rejected';
    reason: string;
    createdAt: number;
    reviewedAt?: number;
    reviewNotes?: string;
  };
}

function ViolationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();
  
  const contentType = searchParams.get('type') as 'post' | 'comment' | null;
  const contentId = searchParams.get('id');
  const violationId = searchParams.get('violationId');

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ViolationDetail | null>(null);
  const [error, setError] = useState('');
  
  // Appeal form state
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // Only redirect if auth is done and no user
    if (!user || !token) {
      router.push('/login');
      return;
    }
    
    if (!contentType || !contentId) {
      setError('Thiếu thông tin nội dung');
      setLoading(false);
      return;
    }

    fetchViolationDetail();
  }, [user, token, authLoading, contentType, contentId, violationId]);

  const fetchViolationDetail = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('type', contentType!);
      params.set('id', contentId!);
      if (violationId) params.set('violationId', violationId);

      const response = await fetch(`${API_URL}/users/me/violations?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Không thể tải thông tin vi phạm');
      }

      const result = await response.json();
      setDetail(result.data || result);
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAppeal = async () => {
    if (appealReason.length < 10) {
      setSubmitError('Nội dung kháng cáo phải có ít nhất 10 ký tự');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch(`${API_URL}/appeals/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.userId,
          reason: appealReason,
          appealType: 'content',
          contentType,
          contentId,
          violationId: detail?.violationId,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Gửi kháng cáo thất bại');
      }

      setSubmitted(true);
      setShowAppealForm(false);
      // Refresh to get updated appeal status
      fetchViolationDetail();
    } catch (err: any) {
      setSubmitError(err.message || 'Đã xảy ra lỗi');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'warn': return 'Cảnh báo';
      case 'hide_post': case 'hide_comment': return 'Ẩn nội dung';
      case 'ban_user': return 'Khóa tài khoản';
      default: return type;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      default: return 'text-yellow-600 bg-yellow-50';
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Logo size={56} className="animate-pulse" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
        <div className="max-w-md mx-auto text-center">
          <Logo size={56} className="mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-[#203d11] mb-4">Không tìm thấy thông tin</h1>
          <p className="text-[#203d11]/60 mb-6">{error || 'Nội dung không tồn tại hoặc bạn không có quyền xem.'}</p>
          <Link
            href="/dashboard"
            className="inline-block h-12 px-8 bg-[#203d11] text-white rounded-xl font-semibold leading-[48px] hover:bg-[#2a5016] transition-all"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  const { content, violation, appeal } = detail;
  const canSubmitAppeal = content.canAppeal && (!appeal || appeal.status === 'rejected');
  const contentTypeVi = contentType === 'post' ? 'Bài viết' : 'Bình luận';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${getSeverityColor(violation.severity)}`}>
            {violation.type === 'ban_user' ? (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-[#203d11] mb-2">{contentTypeVi} bị xử lý</h1>
          <p className="text-[#203d11]/60">Xem chi tiết và gửi kháng cáo nếu cần</p>
        </div>

        {/* Violation Info Card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-[#203d11]/5 mb-6">
          <h2 className="font-bold text-[#203d11] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Thông tin vi phạm
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-[#f5f0e8] rounded-xl">
                <p className="text-xs text-[#203d11]/60 mb-1">Hành động</p>
                <p className="font-medium text-[#203d11]">{getActionLabel(violation.type)}</p>
              </div>
              <div className="p-3 bg-[#f5f0e8] rounded-xl">
                <p className="text-xs text-[#203d11]/60 mb-1">Số báo cáo</p>
                <p className="font-medium text-[#203d11]">{violation.reportCount}</p>
              </div>
            </div>
            
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs text-red-600/80 mb-1">Lý do</p>
              <p className="text-[#203d11] font-medium">{violation.reason || 'Không có lý do cụ thể'}</p>
            </div>

            <div className="flex items-center justify-between text-sm text-[#203d11]/60">
              <span>Xử lý bởi: {violation.adminUsername || 'Quản trị viên'}</span>
              <span>{formatDate(violation.createdAt)}</span>
            </div>

            {content.appealDeadline && (
              <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                <p className="text-xs text-yellow-700 mb-1">Hạn kháng cáo</p>
                <p className="font-medium text-yellow-800">{formatDate(content.appealDeadline)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content Preview Card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-[#203d11]/5 mb-6">
          <h2 className="font-bold text-[#203d11] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#975b1d]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Nội dung bị xử lý
          </h2>

          <div className="flex items-start gap-3 mb-4">
            <CachedAvatar
              src={content.authorAvatarUrl}
              alt={content.authorUsername}
              fallbackText={content.authorUsername}
              size="sm"
            />
            <div>
              <p className="font-medium text-[#203d11]">{content.authorUsername}</p>
              <p className="text-xs text-[#203d11]/50">Tác giả</p>
            </div>
          </div>

          <div className="p-4 bg-[#f5f0e8]/50 rounded-xl border border-[#203d11]/10">
            {content.imageUrls && content.imageUrls.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto">
                {content.imageUrls.slice(0, 3).map((url, i) => (
                  <img key={i} src={url} alt="" className="w-20 h-20 object-cover rounded-lg opacity-50" />
                ))}
              </div>
            )}
            <p className="text-[#203d11]/80 italic">
              "{content.caption || content.text || 'Không có nội dung văn bản'}"
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              content.status === 'hidden' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {content.status === 'hidden' ? 'Đã ẩn' : content.status}
            </span>
            {content.hiddenAt && (
              <span className="text-[#203d11]/50">Ẩn lúc: {formatDate(content.hiddenAt)}</span>
            )}
          </div>

        </div>

        {/* Appeal Status */}
        {appeal && (
          <div className={`rounded-2xl p-6 border mb-6 ${
            appeal.status === 'approved' ? 'bg-green-50 border-green-100' :
            appeal.status === 'rejected' ? 'bg-red-50 border-red-100' :
            'bg-yellow-50 border-yellow-100'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">
                {appeal.status === 'approved' ? '✓' : appeal.status === 'rejected' ? '✗' : '⏳'}
              </span>
              <h3 className={`font-bold ${
                appeal.status === 'approved' ? 'text-green-700' :
                appeal.status === 'rejected' ? 'text-red-600' :
                'text-yellow-700'
              }`}>
                {appeal.status === 'approved' ? 'Kháng cáo được chấp nhận' :
                 appeal.status === 'rejected' ? 'Kháng cáo bị từ chối' :
                 'Đang chờ xử lý'}
              </h3>
            </div>
            
            <div className="text-sm space-y-2">
              <p className="text-[#203d11]/70">
                <span className="font-medium">Nội dung kháng cáo:</span> {appeal.reason}
              </p>
              <p className="text-[#203d11]/50">Gửi lúc: {formatDate(appeal.createdAt)}</p>
              
              {appeal.status === 'approved' && (
                <p className="text-green-600 mt-2">
                  Nội dung của bạn đã được khôi phục. Cảm ơn bạn đã phản hồi.
                </p>
              )}
              
              {appeal.status === 'rejected' && appeal.reviewNotes && (
                <div className="mt-2 p-3 bg-white/50 rounded-lg">
                  <p className="text-xs text-red-600/80 mb-1">Phản hồi từ quản trị viên:</p>
                  <p className="text-[#203d11]">{appeal.reviewNotes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success Message */}
        {submitted && (
          <div className="bg-green-50 rounded-2xl p-6 border border-green-100 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-xl">✓</span>
              <div>
                <h3 className="font-bold text-green-700">Đã gửi kháng cáo</h3>
                <p className="text-green-600 text-sm">Kháng cáo của bạn đang được xem xét. Vui lòng chờ phản hồi.</p>
              </div>
            </div>
          </div>
        )}

        {/* Appeal Form */}
        {showAppealForm ? (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-[#203d11]/5 mb-6">
            <h3 className="font-bold text-[#203d11] mb-4">Gửi kháng cáo</h3>
            
            {submitError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {submitError}
              </div>
            )}
            
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              className="w-full h-32 p-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none resize-none transition-all"
              placeholder="Giải thích lý do bạn cho rằng quyết định này không hợp lý... (tối thiểu 10 ký tự)"
              maxLength={1000}
            />
            <p className="text-xs text-[#203d11]/40 mt-2 mb-4">{appealReason.length}/1000 ký tự</p>
            
            <div className="flex gap-3">
              <button
                onClick={handleSubmitAppeal}
                disabled={submitting || appealReason.length < 10}
                className="flex-1 h-10 bg-[#203d11] text-white rounded-lg font-medium hover:bg-[#2a5016] disabled:opacity-50 transition-all"
              >
                {submitting ? 'Đang gửi...' : 'Gửi kháng cáo'}
              </button>
              <button
                onClick={() => {
                  setShowAppealForm(false);
                  setSubmitError('');
                }}
                className="flex-1 h-10 border-2 border-[#203d11]/20 text-[#203d11] rounded-lg font-medium hover:border-[#203d11]/40 transition-all"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : canSubmitAppeal && !submitted && (
          <button
            onClick={() => setShowAppealForm(true)}
            className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] transition-all mb-6"
          >
            {appeal?.status === 'rejected' ? 'Gửi kháng cáo mới' : 'Gửi kháng cáo'}
          </button>
        )}

        {/* Back Button */}
        <Link
          href="/dashboard"
          className="block w-full h-12 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl font-semibold text-center leading-[44px] hover:border-[#203d11]/40 transition-all"
        >
          ← Về trang chủ
        </Link>
      </div>
    </div>
  );
}

export default function ViolationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
          <Logo size={56} className="animate-pulse" />
        </div>
      }
    >
      <ViolationsContent />
    </Suspense>
  );
}
