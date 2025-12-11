import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { AvatarCacheProvider } from '@/contexts/AvatarCacheContext';
import AppLayout from '@/components/AppLayout';
import SuppressWarnings from '@/components/SuppressWarnings';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Everyone Cook',
  description: 'Your personalized cooking assistant powered by AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud'}
        />
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_CDN_URL || 'https://cdn-dev.everyonecook.cloud'}
        />
      </head>
      <body className="antialiased" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <SuppressWarnings />
        <AvatarCacheProvider>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </AvatarCacheProvider>
      </body>
    </html>
  );
}
