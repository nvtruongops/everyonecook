'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import Logo from '@/components/Logo';

export default function Home() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!mounted || loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f0e8]">
        <Logo size={72} className="animate-pulse" />
      </div>
    );

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-sm' : 'bg-transparent'}`}
      >
        <div className="w-full max-w-[1200px] mx-auto px-6 h-20 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={40} />
            <span className="text-xl font-bold text-[#203d11]">Everyone Cook</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-[#203d11]/80 hover:text-[#203d11] font-medium transition-colors"
            >
              Tính năng
            </a>
            <a
              href="#how"
              className="text-[#203d11]/80 hover:text-[#203d11] font-medium transition-colors"
            >
              Cách hoạt động
            </a>
            <a
              href="#about"
              className="text-[#203d11]/80 hover:text-[#203d11] font-medium transition-colors"
            >
              Giới thiệu
            </a>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="h-11 px-6 bg-[#203d11] text-white rounded-lg font-semibold flex items-center hover:bg-[#2a5016] transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="h-11 px-5 text-[#203d11] font-semibold flex items-center hover:text-[#975b1d] transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="h-11 px-6 bg-[#203d11] text-white rounded-lg font-semibold flex items-center hover:bg-[#2a5016] transition-colors"
                >
                  Bắt đầu
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#f5f0e8] to-white">
        <div className="w-full max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#203d11]/10 rounded-full mb-8">
              <span className="w-2 h-2 bg-[#975b1d] rounded-full"></span>
              <span className="text-sm font-medium text-[#203d11]">
                Mạng xã hội ẩm thực Việt Nam
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-[#203d11] leading-tight mb-6">
              Nơi kết nối những
              <br />
              <span className="text-[#975b1d]">đam mê ẩm thực</span>
            </h1>
            <p className="text-lg md:text-xl text-[#203d11]/70 mb-10 leading-relaxed">
              Chia sẻ công thức yêu thích, khám phá món ngon mới mỗi ngày
              <br className="hidden md:block" />
              và kết nối với cộng đồng người yêu nấu ăn khắp mọi nơi.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={user ? '/dashboard' : '/register'}
                className="h-14 px-8 bg-[#203d11] text-white rounded-xl font-bold text-lg flex items-center justify-center hover:bg-[#2a5016] transition-all hover:shadow-lg"
              >
                {user ? 'Vào bếp của bạn' : 'Tham gia miễn phí'}
              </Link>
              <Link
                href="/dashboard"
                className="h-14 px-8 bg-white text-[#203d11] rounded-xl font-bold text-lg flex items-center justify-center border-2 border-[#203d11]/20 hover:border-[#203d11]/40 transition-all"
              >
                Khám phá ngay
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="w-full max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#975b1d] uppercase tracking-wider mb-3">
              Tính năng
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#203d11]">
              Mọi thứ bạn cần để tỏa sáng
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Đăng bài nhanh',
                desc: 'Chia sẻ khoảnh khắc món ăn đẹp mắt chỉ trong vài giây với giao diện đơn giản.',
              },
              {
                title: 'Công thức chi tiết',
                desc: 'Lưu trữ nguyên liệu, các bước thực hiện và mẹo nấu ăn độc quyền của bạn.',
              },
              {
                title: 'AI gợi ý thông minh',
                desc: 'Hết ý tưởng? AI sẽ đề xuất món ngon dựa trên nguyên liệu bạn đang có.',
              },
              {
                title: 'Quyền riêng tư linh hoạt',
                desc: 'Toàn quyền kiểm soát ai có thể xem bài viết: công khai, bạn bè hoặc riêng tư.',
              },
              {
                title: 'Cộng đồng sôi nổi',
                desc: 'Theo dõi đầu bếp yêu thích, thả tim, bình luận và lưu công thức hay.',
              },
              {
                title: 'Tìm kiếm mạnh mẽ',
                desc: 'Bộ lọc thông minh giúp tìm món ăn theo tên, nguyên liệu hoặc chế độ ăn.',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="p-8 rounded-2xl bg-[#f5f0e8]/50 border border-[#203d11]/5 hover:shadow-lg hover:border-[#975b1d]/20 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-[#203d11] rounded-xl flex items-center justify-center text-white font-bold text-lg mb-5">
                  {i + 1}
                </div>
                <h3 className="text-xl font-bold text-[#203d11] mb-3">{f.title}</h3>
                <p className="text-[#203d11]/70 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how" className="py-24 bg-[#203d11]">
        <div className="w-full max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#975b1d] uppercase tracking-wider mb-3">
              Quy trình
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white">Bắt đầu chỉ với 4 bước</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Đăng ký', desc: 'Tạo tài khoản miễn phí trong 30 giây' },
              {
                step: '02',
                title: 'Nấu & Chụp',
                desc: 'Thực hiện món ngon và ghi lại khoảnh khắc',
              },
              { step: '03', title: 'Chia sẻ', desc: 'Đăng tải lên feed hoặc viết công thức' },
              { step: '04', title: 'Kết nối', desc: 'Nhận tương tác và khám phá món mới' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-[#975b1d] flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#975b1d]">{s.step}</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{s.title}</h3>
                <p className="text-white/60">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 bg-[#f5f0e8]">
        <div className="w-full max-w-[1200px] mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-semibold text-[#975b1d] uppercase tracking-wider mb-3">
                Về chúng tôi
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-[#203d11] mb-6">
                Everyone Cook là gì?
              </h2>
              <p className="text-lg text-[#203d11]/70 leading-relaxed mb-6">
                Everyone Cook là nền tảng mạng xã hội được thiết kế riêng cho những người yêu thích
                ẩm thực. Không giống các mạng xã hội thông thường, chúng tôi tập trung hoàn toàn vào
                việc chia sẻ công thức, món ăn và kết nối cộng đồng đầu bếp.
              </p>
              <div className="space-y-4">
                {['Miễn phí hoàn toàn', 'Bảo mật thông tin', 'Cộng đồng thân thiện'].map(
                  (item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-[#203d11] rounded-full flex items-center justify-center text-white text-xs font-bold">
                        ✓
                      </div>
                      <span className="text-[#203d11] font-medium">{item}</span>
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="bg-white rounded-3xl p-10 shadow-xl">
              <Logo size={64} className="mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-[#203d11] text-center mb-4">
                Sẵn sàng bắt đầu?
              </h3>
              <p className="text-[#203d11]/70 text-center mb-8">
                Tham gia cộng đồng đầu bếp sáng tạo ngay hôm nay.
              </p>
              <Link
                href="/register"
                className="w-full h-14 bg-[#975b1d] text-white rounded-xl font-bold text-lg flex items-center justify-center hover:bg-[#7a4917] transition-colors"
              >
                Tạo tài khoản miễn phí
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-[#15290b]">
        <div className="w-full max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <Logo size={32} />
              <span className="text-lg font-bold text-white">Everyone Cook</span>
            </div>
            <div className="flex items-center gap-8 text-sm">
              <Link href="/privacy" className="text-white/60 hover:text-white transition-colors">
                Chính sách bảo mật
              </Link>
              <Link href="/terms" className="text-white/60 hover:text-white transition-colors">
                Điều khoản sử dụng
              </Link>
              <Link href="/login" className="text-white/60 hover:text-white transition-colors">
                Đăng nhập
              </Link>
              <Link href="/register" className="text-white/60 hover:text-white transition-colors">
                Đăng ký
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10 text-center">
            <p className="text-white/40 text-sm">
              © {new Date().getFullYear()} Everyone Cook. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
