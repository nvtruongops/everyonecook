'use client';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { getIdToken, isTokenExpiringSoon } from '@/lib/token-helper';

export default function SessionExpiredHandler() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const check = () => {
      const token = getIdToken();
      if (user && !token) {
        router.push('/login?message=session_expired');
        return;
      }
      if (user && isTokenExpiringSoon()) console.log('Token expiring soon');
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [user, loading, router]);

  return null;
}
