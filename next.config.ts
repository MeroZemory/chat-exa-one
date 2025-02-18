import type { NextConfig } from "next";

const distDir = process.env.DIST_DIR;
const isDev = process.env.NEXT_PUBLIC_DEV_MODE === "true";

const nextConfig: NextConfig = {
  distDir,
  /* config options here */
  reactStrictMode: true,
  webpack: (config, { dev, isServer }) => {
    // 개발 빌드에서만 소스맵 생성
    if (isDev) {
      config.devtool = "source-map";
    }

    // 환경별 alias 설정
    if (dev) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@server": "./server",
      };
    }

    return config;
  },
};

export default nextConfig;
