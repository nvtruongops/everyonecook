'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AdminRoute from '@/components/AdminRoute';
import { authService } from '@/lib/auth';

const navItems = [
  { name: 'Dashboard', href: '/admin', label: 'D' },
  { name: 'Quản lý Users', href: '/admin/users', label: 'U' },
  { name: 'Báo cáo vi phạm', href: '/admin/reports', label: 'R' },
  { name: 'Góp ý', href: '/admin/feedbacks', label: 'G' },
  { name: 'Kháng cáo', href: '/admin/appeals', label: 'K' },
  { name: 'Hoạt động gần đây', href: '/admin/activity', label: 'H' },
  { name: 'Thống kê hệ thống', href: '/admin/stats', label: 'S' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      router.push('/');
    } catch {}
  };

  return (
    <AdminRoute>
      <div className="min-h-screen bg-[#f5f0e8]">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="h-16 flex items-center justify-between px-4 border-b border-[#203d11]/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#203d11] rounded-xl flex items-center justify-center text-white text-sm font-bold">
                EC
              </div>
              <span className="font-bold text-[#203d11]">Admin Panel</span>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="md:hidden p-2 text-[#203d11] hover:bg-[#f5f0e8] rounded-lg transition-colors duration-200"
            >
              <span className="text-xl font-light">×</span>
            </button>
          </div>

          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                    isActive 
                      ? 'bg-[#203d11] text-white font-semibold shadow-md' 
                      : 'text-[#203d11]/70 hover:bg-[#f5f0e8] hover:text-[#203d11]'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    isActive ? 'bg-white/20' : 'bg-[#203d11]/10'
                  }`}>
                    {item.label}
                  </span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#203d11]/10 bg-white">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#203d11]/70 hover:bg-[#f5f0e8] hover:text-[#203d11] mb-2 transition-all duration-200"
            >
              <span className="w-8 h-8 rounded-lg bg-[#203d11]/10 flex items-center justify-center text-sm font-bold">←</span>
              <span>Về trang chính</span>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-200"
            >
              <span className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-sm font-bold">X</span>
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        <div className="md:pl-64">
          <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-6 border-b border-[#203d11]/10 sticky top-0 z-30">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl hover:bg-[#f5f0e8] text-[#203d11] transition-colors duration-200"
            >
              <span className="text-xl">≡</span>
            </button>
            <div className="hidden md:block">
              <h1 className="text-lg font-bold text-[#203d11]">Everyone Cook Admin</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#203d11]/60 hidden sm:inline">Admin</span>
            </div>
          </header>
          <main className="py-6 md:py-8">
            <div className="max-w-[1200px] mx-auto px-4 md:px-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AdminRoute>
  );
}
