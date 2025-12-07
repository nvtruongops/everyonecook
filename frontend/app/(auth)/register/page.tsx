'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameOk, setUsernameOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (form.username.length < 3) {
      setUsernameOk(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud'}/users/username/check?username=${encodeURIComponent(form.username)}`
        );
        const data = (await res.json()).data || (await res.json());
        setUsernameOk(data.valid && data.available);
      } catch {
        setUsernameOk(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.username]);

  const validate = () => {
    if (!form.name || !form.username || !form.email || !form.password || !form.confirmPassword)
      return 'Vui lòng điền đầy đủ thông tin';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email không hợp lệ';
    if (
      form.password.length < 12 ||
      !/[a-z]/.test(form.password) ||
      !/[A-Z]/.test(form.password) ||
      !/\d/.test(form.password) ||
      !/[!@#$%^&*]/.test(form.password)
    )
      return 'Mật khẩu cần 12+ ký tự, chữ hoa, thường, số, ký tự đặc biệt';
    if (form.password !== form.confirmPassword) return 'Mật khẩu không khớp';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password, form.name);
      setStep('verify');
    } catch (e: any) {
      setError(e.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      setError('Nhập mã xác nhận');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { authService } = await import('@/services/auth-service');
      await authService.confirmRegistration(form.username, code);
      router.push('/login?registered=true');
    } catch (e: any) {
      setError(e.message || 'Xác thực thất bại');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all';

  if (step === 'verify')
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center py-24 px-6">
        <div className="w-full max-w-[1200px]">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-10">
              <Logo size={56} className="mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-[#203d11] mb-2">Xác nhận email</h1>
              <p className="text-[#203d11]/60">
                Mã xác nhận đã được gửi đến{' '}
                <span className="font-medium text-[#203d11]">{form.email}</span>
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-xl border border-[#203d11]/5">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleVerify} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-[#203d11] mb-2">
                    Mã xác nhận (6 số)
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
                  {loading ? 'Đang xử lý...' : 'Xác nhận'}
                </button>
              </form>
            </div>
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
            <h1 className="text-3xl font-bold text-[#203d11] mb-2">Tạo tài khoản</h1>
            <p className="text-[#203d11]/60">Tham gia cộng đồng đầu bếp sáng tạo</p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-xl border border-[#203d11]/5">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Họ và tên</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">
                  Tên người dùng
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className={inputClass}
                    placeholder="username"
                  />
                  {usernameOk !== null && (
                    <span
                      className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold ${usernameOk ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {usernameOk ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Mật khẩu</label>
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
                disabled={loading || usernameOk === false}
                className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Đang xử lý...' : 'Đăng ký'}
              </button>
            </form>
            <div className="mt-8 pt-6 border-t border-[#203d11]/10 text-center">
              <p className="text-[#203d11]/60">
                Đã có tài khoản?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-[#203d11] hover:text-[#975b1d] transition-colors"
                >
                  Đăng nhập
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
