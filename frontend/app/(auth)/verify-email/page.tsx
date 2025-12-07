'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/services/auth-service';
import Logo from '@/components/Logo';

function VerifyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState(searchParams.get('username') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!username) {
      try {
        setUsername(localStorage.getItem('pendingVerificationUsername') || '');
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Nhập mã 6 số');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.confirmRegistration(username, code);
      try {
        localStorage.removeItem('pendingVerificationUsername');
      } catch {}
      router.push('/login?verified=true');
    } catch (e: any) {
      setError(e.message || 'Mã không đúng');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);
    try {
      await authService.resendVerificationCode(username);
      setCountdown(60);
    } catch (e: any) {
      setError(e.message || 'Không thể gửi lại');
    } finally {
      setLoading(false);
    }
  };

  if (!username)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
        <div className="w-full max-w-[1200px]">
          <div className="max-w-md mx-auto text-center">
            <Logo size={56} className="mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-[#203d11] mb-4">Không tìm thấy thông tin</h1>
            <p className="text-[#203d11]/60 mb-6">Vui lòng đăng ký hoặc đăng nhập lại.</p>
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
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <Logo size={56} className="mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-[#203d11] mb-2">Xác thực email</h1>
            <p className="text-[#203d11]/60">Nhập mã 6 số đã gửi đến email của bạn</p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-xl border border-[#203d11]/5">
            <div className="mb-6 p-4 bg-[#f5f0e8] rounded-xl text-center">
              <p className="text-sm text-[#203d11]/60">Tài khoản</p>
              <p className="font-semibold text-[#203d11]">{username}</p>
            </div>
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">
                  Mã xác thực
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full h-14 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-center text-2xl tracking-[0.3em] font-mono text-[#203d11] focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Đang xử lý...' : 'Xác thực'}
              </button>
            </form>
            <div className="mt-6 text-center">
              <p className="text-sm text-[#203d11]/60 mb-2">Không nhận được mã?</p>
              <button
                onClick={handleResend}
                disabled={countdown > 0 || loading}
                className="text-sm font-semibold text-[#975b1d] hover:text-[#203d11] disabled:opacity-50 transition-colors"
              >
                {countdown > 0 ? `Gửi lại sau ${countdown}s` : 'Gửi lại mã'}
              </button>
            </div>
            <div className="mt-8 pt-6 border-t border-[#203d11]/10 text-center">
              <Link
                href="/login"
                className="text-sm font-medium text-[#975b1d] hover:text-[#203d11] transition-colors"
              >
                ← Quay lại đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
          <Logo size={56} className="animate-pulse" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
