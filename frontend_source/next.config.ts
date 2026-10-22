import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for PWA — outputs static files that can be cached
  output: 'standalone',


    // Uploaded files and saved web pages live on the backend at /uploads/...
  // On the server nginx serves /uploads itself; on the laptop this passes it to the backend.
  async rewrites() {
    return [{ source: '/uploads/:path*', destination: `${process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/uploads/:path*` }];
  },

  // Headers for PWA
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;