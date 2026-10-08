import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    lockDistDir: false,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
