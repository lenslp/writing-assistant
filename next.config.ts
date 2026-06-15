import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
