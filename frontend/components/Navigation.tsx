'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import NotificationDropdown from './notifications/NotificationDropdown';
import CachedAvatar from './ui/CachedAvatar';
import { isAdmin } from '@/lib/adminAuth';
import FeedbackModal from './feedback/FeedbackModal';
import Logo from './Logo';
import styles from './Navigation.module.css';

export default function Navigation() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) isAdmin().then(setIsUserAdmin);
  }, [user]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };
  const isActive = (path: string) => pathname === path;
  const navClass = (path: string) =>
    `px-4 py-2 rounded-xl text-sm font-medium transition-all ${isActive(path) ? 'bg-[#203d11] text-white' : 'text-[#203d11] hover:bg-[#f5f0e8]'}`;

  if (!user) return null;

  const navItems = [
    { href: '/dashboard', label: 'Trang chủ' },
    { href: '/friends', label: 'Bạn bè' },
    { href: '/cooking', label: 'Tìm món với AI' },
    { href: '/manageRecipe', label: 'Quản lý' },
  ];

  return (
    <>
    <nav
      className="navigation-fixed bg-white/95 backdrop-blur border-b border-[#203d11]/10"
      style={{ overflow: 'visible' }}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-3">
              <Logo size={40} />
              <div className="hidden sm:block">
                <span className="text-xl font-bold text-[#203d11]">Everyone Cook</span>
                <div className="text-xs text-[#203d11]/60 -mt-1">AI-Powered Recipes</div>
              </div>
            </Link>
            <div className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className={navClass(item.href)}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3" style={{ position: 'relative' }}>
            <button
              onClick={() => setFeedbackOpen(true)}
              className="p-2 rounded-full text-[#203d11]/70 hover:text-[#975b1d] hover:bg-[#f5f0e8] transition-all"
              title="Góp ý"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            <NotificationDropdown />
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-[#f5f0e8] transition-all"
              >
                <CachedAvatar
                  isCurrentUser
                  alt={user.fullName || user.email || 'User'}
                  fallbackText={user.fullName}
                  size="sm"
                  priority
                />
                <svg className="hidden sm:block w-4 h-4 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className={`${styles.profileDropdown} ${profileOpen ? styles.show : ''}`}>
                <div className="px-4 py-4 border-b border-[#203d11]/10">
                  <div className="flex flex-col items-center">
                    <CachedAvatar
                      isCurrentUser
                      alt={user.fullName || user.email || 'User'}
                      fallbackText={user.fullName}
                      size="md"
                    />
                    <div className="mt-3 text-center">
                      <div className="text-base font-bold text-[#203d11]">
                        {user.fullName || 'User'}
                      </div>
                      <div className="text-sm text-[#203d11]/60">{user.email}</div>
                    </div>
                  </div>
                </div>
                <div className="py-2">
                  <Link
                    href="/profile"
                    className="block px-4 py-3 text-sm text-[#203d11] hover:bg-[#f5f0e8] transition-all"
                    onClick={() => setProfileOpen(false)}
                  >
                    Hồ sơ của tôi
                  </Link>
                  <Link
                    href="/profile/resetPassword"
                    className="block px-4 py-3 text-sm text-[#203d11] hover:bg-[#f5f0e8] transition-all"
                    onClick={() => setProfileOpen(false)}
                  >
                    Đặt lại mật khẩu
                  </Link>
                  {isUserAdmin && (
                    <Link
                      href="/admin"
                      className="block px-4 py-3 text-sm text-[#975b1d] hover:bg-[#f5f0e8] transition-all"
                      onClick={() => setProfileOpen(false)}
                    >
                      Admin Panel
                    </Link>
                  )}
                  <hr className="my-2 border-[#203d11]/10" />
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-all"
                  >
                    Đăng xuất
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-xl text-[#203d11] hover:bg-[#f5f0e8] transition-all"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden pb-4 space-y-1 border-t border-[#203d11]/10 pt-3">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={`block ${navClass(item.href)}`}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
    {feedbackOpen && <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
  </>
  );
}
