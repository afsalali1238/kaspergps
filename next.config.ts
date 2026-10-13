import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/app/downloads',
        destination: '/app/reports#recent',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
