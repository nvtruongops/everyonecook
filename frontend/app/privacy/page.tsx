'use client';
import Link from 'next/link';
import Logo from '@/components/Logo';

export default function PrivacyPage() {
  const sections = [
    { id: 1, title: 'Tổng quan', desc: 'Cam kết bảo vệ quyền riêng tư của bạn' },
    { id: 2, title: 'Thông tin thu thập', desc: 'Những dữ liệu chúng tôi thu thập' },
    { id: 3, title: 'Mục đích sử dụng', desc: 'Chúng tôi sử dụng dữ liệu như thế nào' },
    { id: 4, title: 'Bảo vệ dữ liệu', desc: 'Các biện pháp bảo mật' },
    { id: 5, title: 'Quyền của bạn', desc: 'Kiểm soát hoàn toàn dữ liệu cá nhân' },
  ];

  const dataTypes = [
    { title: 'Thông tin tài khoản', items: ['Họ và tên', 'Email', 'Username', 'Avatar'] },
    { title: 'Nội dung người dùng', items: ['Bài đăng', 'Công thức', 'Bình luận', 'Yêu thích'] },
    { title: 'Dữ liệu tương tác', items: ['Lượt thích', 'Bạn bè', 'Lịch sử', 'Cài đặt'] },
    { title: 'Dữ liệu kỹ thuật', items: ['IP', 'Trình duyệt', 'Thiết bị', 'Cookie'] },
  ];

  const purposes = [
    { title: 'Vận hành dịch vụ', desc: 'Cung cấp, duy trì và cải thiện các tính năng' },
    { title: 'Cá nhân hóa', desc: 'Gợi ý công thức phù hợp với sở thích' },
    { title: 'Tính năng AI', desc: 'Xử lý yêu cầu gợi ý món ăn' },
    { title: 'Thông báo', desc: 'Gửi thông tin về hoạt động quan trọng' },
    { title: 'Bảo mật', desc: 'Phát hiện và ngăn chặn gian lận' },
  ];

  const security = ['Mã hóa SSL/TLS', 'Mã hóa mật khẩu', 'Hạ tầng AWS', 'Xác thực Cognito', 'Kiểm toán định kỳ', 'Giám sát 24/7'];

  const rights = [
    { title: 'Quyền truy cập', desc: 'Xem và tải xuống dữ liệu cá nhân' },
    { title: 'Quyền chỉnh sửa', desc: 'Cập nhật thông tin bất kỳ lúc nào' },
    { title: 'Quyền xóa', desc: 'Yêu cầu xóa vĩnh viễn tài khoản' },
    { title: 'Quyền kiểm soát', desc: 'Tùy chỉnh ai có thể xem bài đăng' },
    { title: 'Quyền từ chối', desc: 'Tắt thông báo hoặc từ chối thu thập' },
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
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#975b1d]/10 text-[#975b1d] mb-6">
              <span className="text-sm font-semibold">Chính Sách Bảo Mật</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#203d11] mb-3">Chính Sách Bảo Mật</h1>
            <p className="text-[#203d11]/60">Cập nhật lần cuối: Tháng 12, 2025</p>
          </div>

          <div className="mb-12 p-6 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
            <h3 className="text-sm font-bold text-[#203d11] uppercase tracking-wider mb-4">Mục lục</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {sections.map(s => (
                <a key={s.id} href={`#section-${s.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-[#203d11]/70 hover:text-[#975b1d] hover:bg-white rounded-xl transition">
                  <span className="w-6 h-6 rounded-full bg-[#975b1d]/10 text-[#975b1d] text-xs font-bold flex items-center justify-center">{s.id}</span>
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-10">
            <section id="section-1" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#975b1d] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">01</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Tổng Quan</h2><p className="text-[#203d11]/60 text-sm">Cam kết bảo vệ quyền riêng tư của bạn</p></div>
              </div>
              <div className="pl-14 text-[#203d11]/80 space-y-4">
                <p>Tại <span className="text-[#975b1d] font-semibold">Everyone Cook</span>, chúng tôi hiểu rằng quyền riêng tư là quyền cơ bản của mỗi người dùng. Chính sách bảo mật này được xây dựng với mục tiêu minh bạch, giúp bạn hiểu rõ cách chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân của bạn.</p>
                <div className="p-4 bg-[#975b1d]/5 rounded-xl border-l-4 border-[#975b1d]">
                  <p className="text-[#975b1d] text-sm">Chính sách này áp dụng cho tất cả dịch vụ của Everyone Cook, bao gồm ứng dụng web, các tính năng AI và mọi tương tác trên nền tảng.</p>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-2" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#975b1d] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">02</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Thông Tin Thu Thập</h2><p className="text-[#203d11]/60 text-sm">Những dữ liệu chúng tôi thu thập</p></div>
              </div>
              <div className="pl-14 grid md:grid-cols-2 gap-4">
                {dataTypes.map((d, i) => (
                  <div key={i} className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                    <h3 className="font-semibold text-[#203d11] mb-3">{d.title}</h3>
                    <ul className="text-sm text-[#203d11]/70 space-y-1">{d.items.map((item, j) => <li key={j}>• {item}</li>)}</ul>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <section id="section-3" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#975b1d] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">03</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Mục Đích Sử Dụng</h2><p className="text-[#203d11]/60 text-sm">Chúng tôi sử dụng dữ liệu như thế nào</p></div>
              </div>
              <div className="pl-14 space-y-3">
                {purposes.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#f5f0e8]/50 transition">
                    <span className="w-6 h-6 rounded-full bg-[#203d11]/10 text-[#203d11] text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <div><h4 className="font-semibold text-[#203d11]">{p.title}</h4><p className="text-[#203d11]/70 text-sm">{p.desc}</p></div>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <section id="section-4" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#975b1d] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">04</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Bảo Vệ Dữ Liệu</h2><p className="text-[#203d11]/60 text-sm">Các biện pháp bảo mật</p></div>
              </div>
              <div className="pl-14 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {security.map((s, i) => <div key={i} className="text-center p-4 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10"><span className="text-sm font-medium text-[#203d11]">{s}</span></div>)}
                </div>
                <div className="p-4 bg-red-50 rounded-xl border-l-4 border-red-400">
                  <p className="text-red-700 text-sm">Chúng tôi KHÔNG BAO GIỜ bán hoặc cho thuê thông tin cá nhân của bạn cho bên thứ ba vì mục đích thương mại.</p>
                </div>
              </div>
            </section>

            <Divider />

            <section id="section-5" className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#975b1d] flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">05</span></div>
                <div><h2 className="text-xl font-bold text-[#203d11]">Quyền Của Bạn</h2><p className="text-[#203d11]/60 text-sm">Kiểm soát hoàn toàn dữ liệu cá nhân</p></div>
              </div>
              <div className="pl-14 space-y-3">
                {rights.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#f5f0e8]/50 transition">
                    <div className="w-6 h-6 rounded-full bg-[#203d11]/10 flex items-center justify-center flex-shrink-0 text-[#203d11] text-xs font-bold">{i + 1}</div>
                    <div><h4 className="font-semibold text-[#203d11]">{r.title}</h4><p className="text-[#203d11]/70 text-sm">{r.desc}</p></div>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                <h3 className="font-bold text-[#203d11] mb-2">Cookie</h3>
                <p className="text-[#203d11]/70 text-sm">Chúng tôi sử dụng cookie để duy trì phiên đăng nhập và cải thiện trải nghiệm người dùng.</p>
              </div>
              <div className="p-5 bg-[#f5f0e8]/50 rounded-2xl border border-[#203d11]/10">
                <h3 className="font-bold text-[#203d11] mb-2">Cập Nhật</h3>
                <p className="text-[#203d11]/70 text-sm">Chính sách có thể được cập nhật. Thay đổi quan trọng sẽ được thông báo trước 7 ngày.</p>
              </div>
            </div>

            <div className="p-6 bg-[#975b1d]/5 rounded-2xl border border-[#975b1d]/20 text-center">
              <h3 className="font-bold text-[#203d11] mb-2">Cần hỗ trợ?</h3>
              <p className="text-[#203d11]/70 text-sm mb-4">Nếu bạn có câu hỏi về chính sách bảo mật, hãy liên hệ với chúng tôi.</p>
              <a href="mailto:everyonecookcloud@gmail.com" className="inline-flex items-center px-4 py-2 h-10 bg-[#975b1d] text-white rounded-xl font-semibold hover:bg-[#7a4917] transition">everyonecookcloud@gmail.com</a>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[#203d11]/10 text-center">
            <p className="text-[#203d11]/60 text-sm">Bằng việc sử dụng Everyone Cook, bạn xác nhận đã đọc và đồng ý với chính sách này.</p>
            <Link href="/terms" className="text-[#975b1d] hover:underline text-sm font-semibold mt-4 inline-block">Xem Điều Khoản Dịch Vụ →</Link>
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
      <div className="w-2 h-2 rounded-full bg-[#975b1d]/30" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#203d11]/20 to-transparent" />
    </div>
  );
}
