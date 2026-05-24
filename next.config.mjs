/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Performance: Enable compression and optimize production builds
  compress: true,
  // Caching headers for static assets to improve LCP
  async headers() {
    return [
      {
        // Cache static assets (JS, CSS, fonts, images) for 1 year with immutable
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache font files aggressively
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache images for 1 week
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // HTML pages: short cache with revalidation for fresh content
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
  // Optimize package imports to reduce bundle size
  experimental: {
    optimizePackageImports: ['@/components', '@/services'],
  },
};

export default nextConfig;
