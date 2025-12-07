/**
 * Nutrition section layout with feature flag protection
 */

'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Navigation from '@/components/Navigation';

interface NutritionLayoutProps {
  children: React.ReactNode;
}

export default function NutritionLayout({ children }: NutritionLayoutProps) {
  const { isNutritionEnabled } = useFeatureFlags();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect if nutrition features are disabled
    if (!loading && !isNutritionEnabled()) {
      router.push('/dashboard');
      return;
    }

    // Redirect if not authenticated
    if (!loading && !user) {
      router.push('/login');
      return;
    }
  }, [isNutritionEnabled, user, loading, router]);

  // Show loading while checking authentication and feature flags
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Don't render if nutrition is disabled or user not authenticated
  if (!isNutritionEnabled() || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}

