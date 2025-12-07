'use client';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import Navigation from './Navigation';
import { useBanStatus } from '@/hooks/useBanStatus';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  useBanStatus();

  const noNavPages = ['/login', '/register', '/forgot-password', '/', '/banned'];
  const showNav =
    user &&
    !noNavPages.includes(pathname) &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/banned');

  return (
    <>
      {showNav && <Navigation />}
      <main className={showNav ? 'pt-16' : ''}>{children}</main>
    </>
  );
}
