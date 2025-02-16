import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // HMR 시 소스 맵 업데이트 추가
      config.devtool = "eval-source-map";
    }
    return config;
  },
};

export default nextConfig;
