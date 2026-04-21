import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ["resumewise.lcl"],
  // pdf2json reads files + uses Node APIs — keep it out of the bundle.
  serverExternalPackages: ["pdf2json", "better-sqlite3"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
