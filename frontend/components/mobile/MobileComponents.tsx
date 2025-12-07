/**
 * Lazy-loaded Mobile Components
 * Code-split mobile-specific components to reduce initial bundle size
 */

'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Lazy load BottomNav with no SSR (mobile-only, client-side only)
export const BottomNav = dynamic(
  () => import('./BottomNav'),
  {
    ssr: false,
    loading: () => null, // No loading state needed - component handles its own visibility
  }
);

// Lazy load DrawerMenu with no SSR (mobile-only, client-side only)
export const DrawerMenu = dynamic(
  () => import('./DrawerMenu'),
  {
    ssr: false,
    loading: () => null, // No loading state needed - only shown when opened
  }
);

// Export types for convenience
export type { BottomNavProps, NavItem } from './BottomNav';
export type { DrawerMenuProps } from './DrawerMenu';

