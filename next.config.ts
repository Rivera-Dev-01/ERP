import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-table',
      'decimal.js',
      'sonner',
      '@supabase/ssr',
      'date-fns',
    ],
    // Cache dynamic server data for 30s where possible (per-request React.cache still dedupes)
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // Long-cache static assets via headers is handled by proxy matcher; keep middleware lean
};

export default nextConfig;
