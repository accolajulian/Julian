import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bull, ioredis, twilio are Node.js-only — keep them server-side only
  serverExternalPackages: ["bull", "ioredis", "twilio", "node-cron"],

  // Turbopack is default in Next.js 16; supply an empty config to silence
  // the "webpack config with no turbopack config" warning
  turbopack: {},

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default nextConfig;
