import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      {
        source: '/teacher-dashboard',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/teacher-dashboard/:path*',
        destination: '/dashboard/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
