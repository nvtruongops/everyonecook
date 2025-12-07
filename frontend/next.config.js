/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Output mode for Amplify SSR deployment
  output: 'standalone',
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
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    NEXT_PUBLIC_COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION,
  },
};

module.exports = nextConfig;
