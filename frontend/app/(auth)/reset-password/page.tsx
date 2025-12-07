'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/services/auth-service';
import Logo from '@/components/Logo';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    username: searchParams.get('username') || '',
    code: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const inputClass =
    'w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.code || !form.password) {
      setError('Điền đầy đủ thông tin');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Mật khẩu không khớp');
      return;
    }
    if (form.password.length < 12) {
      setError('Mật khẩu cần 12+ ký tự');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.confirmPasswordReset({
        username: form.username,
        code: form.code,
        newPassword: form.password,
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Đặt lại thất bại');
    } finally {
      setLoading(false);
    }
  };

  if (success)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
        <div className="w-full max-w-[1200px]">
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 bg-[#203d11] rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl text-white">✓</span>
            </div>
            <h1 className="text-3xl font-bold text-[#203d11] mb-3">Thành công!</h1>
            <p className="text-[#203d11]/60 mb-8">Mật khẩu của bạn đã được đặt lại.</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full max-w-xs h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] transition-all"
            >
              Đăng nhập ngay
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
      <div className="w-full max-w-[1200px]">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <Link href="/" className="inline-block mb-6">
              <Logo size={56} />
            </Link>
            <h1 className="text-3xl font-bold text-[#203d11] mb-2">Đặt lại mật khẩu</h1>
            <p className="text-[#203d11]/60">Nhập mã xác nhận và mật khẩu mới</p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-xl border border-[#203d11]/5">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">
                  Email hoặc Username
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className={inputClass}
                  placeholder="Nhập email hoặc username"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">
                  Mã xác nhận
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className={inputClass}
                  placeholder="Nhập mã từ email"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">
                  Mật khẩu mới
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputClass}
                  placeholder="Tối thiểu 12 ký tự"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">
                  Xác nhận mật khẩu
                </label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className={inputClass}
                  placeholder="Nhập lại mật khẩu"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:opacity-50 transition-all"
              >
                {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
              </button>
            </form>
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
          <Logo size={56} className="animate-pulse" />
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
