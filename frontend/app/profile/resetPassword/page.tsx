'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authService } from '@/services/auth-service';
import ProtectedRoute from '@/components/ProtectedRoute';

function ResetPasswordPageContent() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const calculateStrength = (p: string): number => {
    let s = 0;
    if (p.length >= 12) s += 25;
    if (/[a-z]/.test(p)) s += 25;
    if (/[A-Z]/.test(p)) s += 25;
    if (/[0-9]/.test(p)) s += 12.5;
    if (/[^a-zA-Z0-9]/.test(p)) s += 12.5;
    return Math.min(s, 100);
  };

  const strength = calculateStrength(newPassword);
  const strengthLabel = strength < 50 ? 'Yếu' : strength < 75 ? 'Trung bình' : 'Mạnh';

  const validate = () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Vui lòng điền đầy đủ tất cả các trường.');
      return false;
    }
    if (newPassword.length < 12) {
      setError('Mật khẩu mới phải có ít nhất 12 ký tự.');
      return false;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(newPassword)) {
      setError('Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt.');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError('Hai mật khẩu không khớp.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!validate()) return;
    setLoading(true);
    try {
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        setError('Phiên làm việc đã hết hạn.');
        setLoading(false);
        setTimeout(() => {
          window.location.href = '/login?returnUrl=/profile/resetPassword';
        }, 2000);
        return;
      }
      await authService.changePassword(oldPassword, newPassword);
      setSuccess('Mật khẩu đã được cập nhật thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể thay đổi mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white pb-20 lg:pb-8">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* Back Button */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#203d11] rounded-xl border-2 border-[#203d11]/20 hover:border-[#203d11]/40 hover:bg-[#f5f0e8] transition-all font-medium shadow-sm"
          >
            <span>←</span>
            <span>Quay lại hồ sơ</span>
          </Link>
        </div>

        {/* Main Card */}
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-xl border border-[#203d11]/5">
            {/* Header */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#203d11] flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-[#203d11] text-center mb-2">Cập nhật mật khẩu</h1>
            <p className="text-[#203d11]/60 text-center text-sm mb-8">
              Hãy chọn mật khẩu mạnh để bảo vệ tài khoản
            </p>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="mb-6 p-4 rounded-xl bg-[#203d11]/10 border border-[#203d11]/20">
                <p className="text-[#203d11] text-sm font-medium">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-[#203d11] font-semibold text-xs tracking-wide uppercase mb-2">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <input
                    type={showOld ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full px-4 h-12 rounded-xl bg-[#f5f0e8]/50 border-2 border-transparent text-[#203d11] placeholder-[#203d11]/40 focus:outline-none focus:border-[#975b1d] transition pr-12"
                    placeholder="Nhập mật khẩu hiện tại"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld(!showOld)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#203d11]/50 hover:text-[#203d11] transition"
                  >
                    {showOld ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-[#203d11] font-semibold text-xs tracking-wide uppercase mb-2">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 h-12 rounded-xl bg-[#f5f0e8]/50 border-2 border-transparent text-[#203d11] placeholder-[#203d11]/40 focus:outline-none focus:border-[#975b1d] transition pr-12"
                    placeholder="Tối thiểu 12 ký tự"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#203d11]/50 hover:text-[#203d11] transition"
                  >
                    {showNew ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-3 space-y-2">
                    <div className="w-full h-2 rounded-full bg-[#203d11]/10 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strength < 50 ? 'bg-red-500' : strength < 75 ? 'bg-[#975b1d]' : 'bg-[#203d11]'}`}
                        style={{ width: `${strength}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-[#203d11]/70">
                        Độ mạnh: <span className={`font-semibold ${strength < 50 ? 'text-red-600' : strength < 75 ? 'text-[#975b1d]' : 'text-[#203d11]'}`}>{strengthLabel}</span>
                      </p>
                      <p className="text-xs text-[#203d11]/50">{newPassword.length}/12+ ký tự</p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-[#203d11]/60 mt-3">
                  Chứa chữ hoa, chữ thường, số và ký tự đặc biệt
                </p>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[#203d11] font-semibold text-xs tracking-wide uppercase mb-2">
                  Xác nhận mật khẩu
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 h-12 rounded-xl bg-[#f5f0e8]/50 border-2 border-transparent text-[#203d11] placeholder-[#203d11]/40 focus:outline-none focus:border-[#975b1d] transition pr-12"
                    placeholder="Xác nhận mật khẩu mới"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#203d11]/50 hover:text-[#203d11] transition"
                  >
                    {showConfirm ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {confirmPassword && newPassword === confirmPassword && (
                  <p className="text-xs text-[#203d11] mt-2 font-medium">Mật khẩu khớp</p>
                )}
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-600 mt-2">Mật khẩu không khớp</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl font-semibold text-white bg-[#203d11] hover:bg-[#2a5016] disabled:bg-[#203d11]/50 transition-all shadow-lg mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang cập nhật...
                  </span>
                ) : (
                  'Cập nhật mật khẩu'
                )}
              </button>
            </form>

            <p className="text-xs text-[#203d11]/50 text-center mt-6">
              Mật khẩu sẽ được mã hóa và bảo mật
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <ProtectedRoute>
      <ResetPasswordPageContent />
    </ProtectedRoute>
  );
}
