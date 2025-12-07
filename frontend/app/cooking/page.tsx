'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import SimplifiedCookingPage from '@/components/cooking/SimplifiedCookingPage';
import BottomNav from '@/components/mobile/BottomNav';

export default function CookingPage() {
  return (
    <ProtectedRoute>
      <SimplifiedCookingPage />
      <BottomNav />
    </ProtectedRoute>
  );
}
