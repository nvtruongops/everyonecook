'use client';

import { useEffect } from 'react';

/**
 * Suppress specific console warnings in development
 * These warnings are informational and don't affect functionality
 */
export default function SuppressWarnings() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const originalWarn = console.warn;
    
    console.warn = (...args: any[]) => {
      // Suppress LCP image warning - dynamic content makes it impossible to predict LCP
      if (
        typeof args[0] === 'string' &&
        (args[0].includes('was detected as the Largest Contentful Paint') ||
         args[0].includes('Image with src'))
      ) {
        return;
      }
      originalWarn.apply(console, args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
