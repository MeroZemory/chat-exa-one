import type { NextConfig } from "next";

const distDir = process.env.DIST_DIR;

const nextConfig: NextConfig = {
  distDir,
  /* config options here */
  reactStrictMode: true,
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // HMR 시 소스 맵 업데이트 추가
      config.devtool = "eval-source-map";
    }

    // 환경별 alias 설정
    if (!dev) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@server": "./server",
      };
    }

    return config;
  },
};

export default nextConfig;
