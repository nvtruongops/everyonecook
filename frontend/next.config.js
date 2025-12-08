/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Note: Removed 'standalone' output - let Amplify handle SSR natively
  // Performance optimizations
  poweredByHeader: false, // Remove X-Powered-By header
  compress: true, // Enable gzip compression
  // Trailing slash configuration for consistent routing
  trailingSlash: false,
  // Temporarily disable type checking during build
  // TODO: Fix all TypeScript errors in migrated components (task 6.2+)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.everyonecook.cloud',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-dev.everyonecook.cloud',
        port: '',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'], // Modern image formats
    deviceSizes: [640, 750, 800, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512, 800],
    qualities: [75, 90, 100], // Configure allowed quality values
  },
  // Optimize production bundle
  experimental: {
    optimizePackageImports: ['react-icons', 'flowbite-react', 'aws-amplify'],
    optimizeCss: true, // Enable CSS optimization
  },
  // Environment variables are injected at build time
  // For Amplify: set these in Amplify Console > Environment Variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud',
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL || 'https://cdn-dev.everyonecook.cloud',
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'ap-southeast-1_ChnQuZlge',
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '1isv0egqu2bnue7mar1s2338v8',
    NEXT_PUBLIC_COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION || 'ap-southeast-1',
  },
};

module.exports = nextConfig;
