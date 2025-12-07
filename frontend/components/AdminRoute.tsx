'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/adminAuth';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (process.env.NEXT_PUBLIC_ADMIN_BYPASS === 'true') {
          setAuthorized(true);
          return;
        }
        const admin = await isAdmin();
        if (!admin) {
          router.push('/dashboard');
          return;
        }
        setAuthorized(true);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f5f0e8] to-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]" />
      </div>
    );
  return authorized ? <>{children}</> : null;
}
