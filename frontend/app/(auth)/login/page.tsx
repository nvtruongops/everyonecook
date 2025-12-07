'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('banned') === 'true') {
      setError('Tài khoản đã bị khóa do vi phạm quy định.');
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      const { isAdmin } = await import('@/lib/adminAuth');
      router.push((await isAdmin()) ? '/admin' : '/dashboard');
    } catch (err: any) {
      const msg = err.message || '',
        code = err.code || '';
      if (code === 'UserNotConfirmedException' || msg.includes('not confirmed'))
        router.push(`/verify-email?username=${encodeURIComponent(username)}`);
      else if (msg.toLowerCase().includes('banned') || msg.toLowerCase().includes('disabled'))
        router.push(`/banned?username=${encodeURIComponent(username)}`);
      else setError(msg || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
      <div className="w-full max-w-[1200px]">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <Link href="/" className="inline-block mb-6">
              <Logo size={56} />
            </Link>
            <h1 className="text-3xl font-bold text-[#203d11] mb-2">Chào mừng trở lại</h1>
            <p className="text-[#203d11]/60">Đăng nhập để tiếp tục hành trình ẩm thực</p>
          </div>

          {/* Form Card */}
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
                  placeholder="Nhập email hoặc username"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Mật khẩu</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
                  placeholder="Nhập mật khẩu"
                />
              </div>
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-[#975b1d] hover:text-[#203d11] transition-colors"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Đang xử lý...' : 'Đăng nhập'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-[#203d11]/10 text-center">
              <p className="text-[#203d11]/60">
                Chưa có tài khoản?{' '}
                <Link
                  href="/register"
                  className="font-semibold text-[#203d11] hover:text-[#975b1d] transition-colors"
                >
                  Đăng ký ngay
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
          <Logo size={56} className="animate-pulse" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
