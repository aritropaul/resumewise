import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ["resumewise.lcl"],
  // better-sqlite3 uses native bindings — keep out of bundle for local dev.
  // On Cloudflare, the D1 backend is used instead (no native modules).
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
