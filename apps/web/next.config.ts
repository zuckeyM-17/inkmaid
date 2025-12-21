import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker本番ビルド用のスタンドアロン出力
  output: "standalone",
};

export default nextConfig;
