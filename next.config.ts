import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // pdf2json reads files + uses Node APIs — keep it out of the bundle.
  serverExternalPackages: ["pdf2json"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
