'use client';
import Link from 'next/link';
import Logo from '@/components/Logo';

export default function TermsPage() {
  const sections = [
    { id: 1, title: 'Chấp Nhận Điều Khoản', desc: 'Điều kiện sử dụng dịch vụ' },
    { id: 2, title: 'Tài Khoản', desc: 'Yêu cầu và trách nhiệm' },
    { id: 3, title: 'Quy Tắc Cộng Đồng', desc: 'Những gì được phép và không được phép' },
    { id: 4, title: 'Nội Dung', desc: 'Quyền sở hữu và sử dụng' },
    { id: 5, title: 'Tính Năng AI', desc: 'Giới hạn và trách nhiệm' },
    { id: 6, title: 'Quản Lý Tài Khoản', desc: 'Xóa và tạm ngưng' },
    { id: 7, title: 'Trách Nhiệm Pháp Lý', desc: 'Giới hạn trách nhiệm' },
  ];

  const allowed = [
    'Chia sẻ công thức nấu ăn của bạn',
    'Tương tác tích cực với cộng đồng',
    'Sử dụng AI để gợi ý món ăn',
    'Lưu và quản lý công thức yêu thích',
    'Kết bạn và theo dõi người dùng khác',
  ];

  const notAllowed = [
    'Vi phạm bản quyền nội dung',
    'Quấy rối hoặc bắt nạt người khác',
    'Spam hoặc quảng cáo trái phép',
    'Chia sẻ nội dung không phù hợp',
    'Tạo nhiều tài khoản giả mạo',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-[#203d11]/10">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <Logo size={36} />
            <span className="text-lg font-bold text-[#203d11] group-hover:text-[#975b1d] transition">Everyone Cook</span>
          </Link>
          <Link href="/" className="px-4 py-2 h-10 text-sm font-semibold text-[#203d11] hover:text-[#975b1d] border border-[#203d11]/20 rounded-xl hover:border-[#975b1d] transition flex items-center">← Trang chủ</Link>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-24">
        <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 p-8 md:p-12">
          <div className="text-center mb-12 pb-8 border-b border-[#203d11]/10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#203d11]/10 text-[#203d11] mb-6">
              <span className="text-sm font-semibold">Điều Khoản Dịch Vụ</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#203d11] mb-3">Điều Khoản Dịch Vụ</h1>
            <p className="text-[#203d11]/60">Cập nhật lần cuối: Tháng 12, 2025</p>
          </div>

          <div className="mb-12 p-6 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
            <h3 className="text-sm font-bold text-[#203d11] uppercase tracking-wider mb-4">Mục lục</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {sections.map(s => (
                <a key={s.id} href={`#section-${s.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-[#203d11]/70 hover:text-[#975b1d] hover:bg-white rounded-xl transition">
                  <span className="w-6 h-6 rounded-full bg-[#203d11]/10 text-[#203d11] text-xs font-bold flex items-center justify-center">{s.id}</span>
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-10">
            <section id="section-1" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">01</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Chấp Nhận Điều Khoản</h2><p className="text-[#203d11]/60 text-sm">Điều kiện sử dụng dịch vụ</p></div>
              </div>
              <div className="pl-14 text-[#203d11]/80 space-y-4">
                <p>Bằng việc truy cập và sử dụng <span className="text-[#975b1d] font-semibold">Everyone Cook</span>, bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý tuân thủ các điều khoản dịch vụ này.</p>
                <div className="p-4 bg-[#203d11]/5 rounded-xl border-l-4 border-[#203d11]">
                  <p className="text-[#203d11] text-sm">Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng không sử dụng dịch vụ của chúng tôi.</p>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-2" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">02</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Tài Khoản</h2><p className="text-[#203d11]/60 text-sm">Yêu cầu và trách nhiệm</p></div>
              </div>
              <div className="pl-14 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                    <h3 className="font-semibold text-[#203d11] mb-3">Yêu cầu</h3>
                    <ul className="text-sm text-[#203d11]/70 space-y-2">
                      <li>• Từ 13 tuổi trở lên</li>
                      <li>• Cung cấp thông tin chính xác</li>
                      <li>• Một người một tài khoản</li>
                    </ul>
                  </div>
                  <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                    <h3 className="font-semibold text-[#203d11] mb-3">Trách nhiệm</h3>
                    <ul className="text-sm text-[#203d11]/70 space-y-2">
                      <li>• Giữ an toàn mật khẩu</li>
                      <li>• Chịu trách nhiệm mọi hoạt động</li>
                      <li>• Thông báo khi bị xâm nhập</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-3" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">03</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Quy Tắc Cộng Đồng</h2><p className="text-[#203d11]/60 text-sm">Những gì được phép và không được phép</p></div>
              </div>
              <div className="pl-14 grid md:grid-cols-2 gap-4">
                <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                  <h3 className="font-semibold text-[#203d11] mb-3">Được phép</h3>
                  <ul className="space-y-2">
                    {allowed.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-[#203d11]/70">
                        <span className="w-5 h-5 rounded-full bg-[#203d11]/10 flex items-center justify-center text-[#203d11] text-xs font-bold">{i + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-5 bg-[#975b1d]/5 rounded-2xl border border-[#975b1d]/20">
                  <h3 className="font-semibold text-[#975b1d] mb-3">Không được phép</h3>
                  <ul className="space-y-2">
                    {notAllowed.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-[#975b1d]/80">
                        <span className="w-5 h-5 rounded-full bg-[#975b1d]/10 flex items-center justify-center text-[#975b1d] text-xs font-bold">{i + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-4" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">04</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Nội Dung</h2><p className="text-[#203d11]/60 text-sm">Quyền sở hữu và sử dụng</p></div>
              </div>
              <div className="pl-14 space-y-4">
                <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                  <p className="text-[#203d11]/80 mb-4">Bạn giữ quyền sở hữu đối với nội dung gốc mà bạn tạo ra (công thức, hình ảnh, bài viết). Khi đăng tải, bạn cấp cho chúng tôi quyền hiển thị nội dung đó trên nền tảng.</p>
                  <div className="p-3 bg-[#975b1d]/5 rounded-xl">
                    <p className="text-[#975b1d] text-sm">Chúng tôi có quyền gỡ bỏ nội dung vi phạm quy tắc cộng đồng hoặc pháp luật mà không cần thông báo trước.</p>
                  </div>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-5" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">05</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Tính Năng AI</h2><p className="text-[#203d11]/60 text-sm">Giới hạn và trách nhiệm</p></div>
              </div>
              <div className="pl-14 space-y-4">
                <div className="p-4 bg-[#975b1d]/5 rounded-xl border-l-4 border-[#975b1d]">
                  <p className="text-[#975b1d] text-sm mb-2">Gợi ý từ AI chỉ mang tính chất tham khảo.</p>
                  <ul className="text-[#975b1d]/80 text-sm space-y-1">
                    <li>• Luôn kiểm tra thông tin dị ứng thực phẩm</li>
                    <li>• Đảm bảo nguyên liệu còn tươi và an toàn</li>
                    <li>• Điều chỉnh công thức theo khẩu vị cá nhân</li>
                  </ul>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-6" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">06</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Quản Lý Tài Khoản</h2><p className="text-[#203d11]/60 text-sm">Xóa và tạm ngưng</p></div>
              </div>
              <div className="pl-14 grid md:grid-cols-2 gap-4">
                <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                  <h3 className="font-semibold text-[#203d11] mb-2">Quyền của bạn</h3>
                  <p className="text-[#203d11]/70 text-sm">Bạn có thể xóa tài khoản bất kỳ lúc nào. Dữ liệu sẽ được xóa trong vòng 30 ngày.</p>
                </div>
                <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                  <h3 className="font-semibold text-[#203d11] mb-2">Quyền của chúng tôi</h3>
                  <p className="text-[#203d11]/70 text-sm">Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản vi phạm điều khoản.</p>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-7" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#203d11] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">07</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Trách Nhiệm Pháp Lý</h2><p className="text-[#203d11]/60 text-sm">Giới hạn trách nhiệm</p></div>
              </div>
              <div className="pl-14 space-y-4">
                <p className="text-[#203d11]/80">Dịch vụ được cung cấp "nguyên trạng" (as-is). Chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp phát sinh từ việc sử dụng dịch vụ.</p>
                <div className="p-4 bg-[#203d11]/5 rounded-xl border-l-4 border-[#203d11]">
                  <p className="text-[#203d11] text-sm">Điều khoản này được điều chỉnh theo pháp luật Việt Nam. Mọi tranh chấp sẽ được giải quyết tại tòa án có thẩm quyền.</p>
                </div>
              </div>
            </section>

            <Divider />

            <div className="p-6 bg-[#203d11]/5 rounded-2xl border border-[#203d11]/20 text-center">
              <h3 className="font-bold text-[#203d11] mb-2">Cần hỗ trợ?</h3>
              <p className="text-[#203d11]/70 text-sm mb-4">Nếu bạn có câu hỏi về điều khoản dịch vụ, hãy liên hệ với chúng tôi.</p>
              <a href="mailto:everyonecookcloud@gmail.com" className="inline-flex items-center px-4 py-2 h-10 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] transition">everyonecookcloud@gmail.com</a>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[#203d11]/10 text-center">
            <p className="text-[#203d11]/60 text-sm">Bằng việc sử dụng Everyone Cook, bạn xác nhận đã đọc và đồng ý với điều khoản này.</p>
            <Link href="/privacy" className="text-[#975b1d] hover:underline text-sm font-semibold mt-4 inline-block">Xem Chính Sách Bảo Mật →</Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#203d11]/10 py-8">
        <div className="max-w-[1200px] mx-auto px-6 text-center text-[#203d11]/60 text-sm">© 2025 Everyone Cook. All rights reserved.</div>
      </footer>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#203d11]/20 to-transparent" />
      <div className="w-2 h-2 rounded-full bg-[#203d11]/30" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#203d11]/20 to-transparent" />
    </div>
  );
}
