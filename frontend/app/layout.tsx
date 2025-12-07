import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { AvatarCacheProvider } from '@/contexts/AvatarCacheContext';
import AppLayout from '@/components/AppLayout';

export const metadata: Metadata = {
  title: 'Everyone Cook - AI-Powered Recipe Assistant',
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
        <AvatarCacheProvider>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </AvatarCacheProvider>
      </body>
    </html>
  );
}
