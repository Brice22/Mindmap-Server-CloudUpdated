import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for PWA — outputs static files that can be cached
  output: 'standalone',

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